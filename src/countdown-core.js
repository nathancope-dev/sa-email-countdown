const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { GifCodec, GifFrame } = require('gifwrap');
const fs = require('fs');
const path = require('path');

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 220;
const PADDING = 24;
const DEFAULT_BUCKET_SECONDS = 60;
const DEFAULT_CACHE_HEADER = null; // auto-generated if not provided
const DEFAULT_GIF_FRAMES = 60;
const DEFAULT_GIF_DELAY_CS = null; // auto-spread across bucket by default
const DEFAULT_ACCENT_COLOR = '#22d3ee';
const DEFAULT_BG_COLOR = '#0f172a';
const DEFAULT_TEXT_COLOR = '#ffffff';

// Baseline font sizes for layout
const FONT_SIZE_LABEL = 26;
const FONT_SIZE_VALUE = 56;
const FONT_SIZE_UNIT = 20;
const FONT_SIZE_SUB = 18;

const gifCodec = new GifCodec();

let fontsRegistered = false;
let labelFamily = 'GillSans Regular';
let valueFamily = 'GillSans Regular';

function registerFonts() {
  if (fontsRegistered) return;

  const candidates = [
    { family: 'GillSans Regular', file: path.join(__dirname, 'fonts/GillSans Regular.ttf') },
  ];

  for (const font of candidates) {
    if (fs.existsSync(font.file)) {
      try {
        GlobalFonts.registerFromPath(font.file, font.family);
      } catch (err) {
        console.warn(`Failed to register font ${font.family}`, err);
      }
    }
  }

  // Allow env overrides if provided
  const envFontPath = process.env.FONT_PATH;
  if (envFontPath && fs.existsSync(envFontPath)) {
    const family = process.env.FONT_FAMILY || 'CustomFont';
    try {
      GlobalFonts.registerFromPath(envFontPath, family);
      labelFamily = family;
      valueFamily = family;
    } catch (err) {
      console.warn('Failed to register custom FONT_PATH', err);
    }
  }

  fontsRegistered = true;
}

function parsePositiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  if (max && n > max) return max;
  return n;
}

function readConfigFromEnv() {
  const gifDelayEnv = process.env.GIF_DELAY_CS;
  return {
    allowGif: process.env.ALLOW_GIF !== 'false',
    bucketSeconds: parsePositiveInt(process.env.BUCKET_SECONDS, DEFAULT_BUCKET_SECONDS),
    cacheHeader: process.env.CACHE_HEADER || DEFAULT_CACHE_HEADER,
    gifFrameCount: parsePositiveInt(process.env.GIF_FRAMES, DEFAULT_GIF_FRAMES, 120),
    gifDelayCs: gifDelayEnv ? parsePositiveInt(gifDelayEnv, null, 10000) : null,
  };
}

function parseTargetDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function pickColor(value, fallback) {
  if (!value) return fallback;
  const color = value.toString().trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color) ? color : fallback;
}

function pad(value) {
  return value.toString().padStart(2, '0');
}

function breakdownDuration(diffMs) {
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

const VALUE_HEIGHT_SAMPLE = {
  days: '888',
  hours: '88',
  minutes: '88',
  seconds: '88',
};

function bucketNow(timestampMs, bucketSeconds) {
  const bucketMs = Math.max(1, bucketSeconds) * 1000;
  return Math.floor(timestampMs / bucketMs) * bucketMs;
}

function wantsAnimation(query) {
  const raw = (query.animated || query.format || '').toString().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'gif';
}

async function renderCountdownImage({
                                      targetDate,
                                      label,
                                      subLabel,
                                      accentColor,
                                      backgroundColor,
                                      textColor,
                                      now,
                                    }) {
  const diff = targetDate.getTime() - (now ?? Date.now());
  const parts = breakdownDuration(diff);
  const segments = [
    { value: `${parts.days}`, unit: 'days' },
    { value: pad(parts.hours), unit: 'hours' },
    { value: pad(parts.minutes), unit: 'minutes' },
    { value: pad(parts.seconds), unit: 'seconds' },
  ];

  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d');
  registerFonts();

  // background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // accent bar
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, CANVAS_HEIGHT - 6, CANVAS_WIDTH, 6);

  // measurements
  const spacingLabelValue = 24;
  const spacingValueSub = 24;
  const spacingValueUnit = 8;
  const segmentSpacing = 24;
  const accentHeight = 6;

  ctx.fillStyle = textColor || DEFAULT_TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // label metrics
  ctx.font = `${FONT_SIZE_LABEL}px ${labelFamily}, serif`;
  const labelMetrics = ctx.measureText(label);
  const labelHeight = (labelMetrics.actualBoundingBoxAscent || FONT_SIZE_LABEL) + (labelMetrics.actualBoundingBoxDescent || 0);

  // segment metrics
  let totalSegmentsWidth = 0;
  const segmentHeights = [];
  const segmentWidths = [];
  const valueHeights = [];

  segments.forEach((seg, idx) => {
    const valueSample = VALUE_HEIGHT_SAMPLE[seg.unit] || seg.value;
    ctx.font = `${FONT_SIZE_VALUE}px ${valueFamily}, sans-serif`;
    const sampleMetrics = ctx.measureText(valueSample);
    const valHeight = (sampleMetrics.actualBoundingBoxAscent || FONT_SIZE_VALUE) + (sampleMetrics.actualBoundingBoxDescent || 0);
    const valMetrics = ctx.measureText(seg.value);
    const valWidth = valMetrics.width;

    ctx.font = `${FONT_SIZE_UNIT}px ${valueFamily}, sans-serif`;
    const unitMetrics = ctx.measureText(seg.unit);
    const unitHeight = (unitMetrics.actualBoundingBoxAscent || FONT_SIZE_UNIT) + (unitMetrics.actualBoundingBoxDescent || 0);
    const unitWidth = unitMetrics.width;

    const segmentWidth = Math.max(valWidth, unitWidth);
    const segmentHeight = valHeight + spacingValueUnit + unitHeight;

    segmentWidths[idx] = segmentWidth;
    segmentHeights[idx] = segmentHeight;
    valueHeights[idx] = valHeight;
    totalSegmentsWidth += segmentWidth;
  });

  totalSegmentsWidth += segmentSpacing * (segments.length - 1);

  // sub-label metrics
  let subHeight = 0;
  if (subLabel) {
    ctx.font = `${FONT_SIZE_SUB}px ${valueFamily}, sans-serif`;
    const subMetrics = ctx.measureText(subLabel);
    subHeight = (subMetrics.actualBoundingBoxAscent || FONT_SIZE_SUB) + (subMetrics.actualBoundingBoxDescent || 0);
  }

  const maxSegmentHeight = Math.max(...segmentHeights);
  const totalHeight =
      labelHeight +
      spacingLabelValue +
      maxSegmentHeight +
      (subLabel ? spacingValueSub + subHeight : 0);

  const startY = Math.max(PADDING, (CANVAS_HEIGHT - accentHeight - totalHeight) / 2);
  // draw label
  ctx.font = `${FONT_SIZE_LABEL}px ${labelFamily}, serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(label, CANVAS_WIDTH / 2, startY);

  // draw segments
  const valueY = startY + labelHeight + spacingLabelValue;
  let currentX = (CANVAS_WIDTH - totalSegmentsWidth) / 2;
  segments.forEach((seg, idx) => {
    ctx.font = `${FONT_SIZE_VALUE}px ${valueFamily}, sans-serif`;
    const valMetrics = ctx.measureText(seg.value);
    const valHeight = valueHeights[idx];
    const valWidth = valMetrics.width;
    const valX = currentX + (segmentWidths[idx] - valWidth) / 2;
    ctx.fillText(seg.value, valX + valWidth / 2, valueY); // center via computed x

    ctx.font = `${FONT_SIZE_UNIT}px ${valueFamily}, sans-serif`;
    const unitMetrics = ctx.measureText(seg.unit);
    const unitHeight = (unitMetrics.actualBoundingBoxAscent || FONT_SIZE_UNIT) + (unitMetrics.actualBoundingBoxDescent || 0);
    const unitWidth = unitMetrics.width;
    const unitY = valueY + valHeight + spacingValueUnit;
    const unitX = currentX + (segmentWidths[idx] - unitWidth) / 2;
    ctx.fillText(seg.unit, unitX + unitWidth / 2, unitY);

    currentX += segmentWidths[idx] + segmentSpacing;
  });

  // draw sub-label if present (below segments with extra breathing room)
  if (subLabel) {
    ctx.font = `${FONT_SIZE_SUB}px ${valueFamily}, sans`;
    const subY = valueY + maxSegmentHeight + spacingValueSub + 4;
    ctx.fillText(subLabel, CANVAS_WIDTH / 2, subY);
  }

  return canvas;
}

async function buildCountdownPng({ targetDate, label, accentColor, backgroundColor, now }) {
  const canvas = await renderCountdownImage({ targetDate, label, accentColor, backgroundColor, now });
  return canvas.toBuffer('image/png');
}

async function buildCountdownGif({
                                   targetDate,
                                   label,
                                   subLabel,
                                   accentColor,
                                   backgroundColor,
                                   textColor,
                                   now,
                                   frameCount = DEFAULT_GIF_FRAMES,
                                   delayCentisecs,
                                   bucketSeconds = DEFAULT_BUCKET_SECONDS,
                                 }) {
  const effectiveDelayCs =
      delayCentisecs ??
      Math.max(1, Math.round((Math.max(1, bucketSeconds) * 100) / Math.max(1, frameCount)));
  const frames = [];
  for (let i = 0; i < frameCount; i += 1) {
    const frameNow = (now ?? Date.now()) + i * (effectiveDelayCs * 10);
    const canvas = await renderCountdownImage({
      targetDate,
      label,
      subLabel,
      accentColor,
      backgroundColor,
      textColor,
      now: frameNow,
    });
    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    frames.push(new GifFrame(CANVAS_WIDTH, CANVAS_HEIGHT, Buffer.from(data), { delayCentisecs: effectiveDelayCs }));
  }

  const { buffer } = await gifCodec.encodeGif(frames, { loops: 0 }); // loop within bucketed clip
  return buffer;
}

async function buildCountdownResponse(query, overrides = {}) {
  const {
    allowGif = true,
    bucketSeconds = DEFAULT_BUCKET_SECONDS,
    cacheHeader = DEFAULT_CACHE_HEADER,
    gifFrameCount = DEFAULT_GIF_FRAMES,
    gifDelayCs = DEFAULT_GIF_DELAY_CS,
  } = overrides;

  const targetDate = parseTargetDate(query.target);
  if (!targetDate) {
    return {
      ok: false,
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: { error: 'Provide target query param as an ISO date, e.g. 2024-12-31T23:59:59Z' },
    };
  }

  const label = (query.label || 'Sale ends in').toString().slice(0, 64);
  const subLabel = query.sub ? query.sub.toString().slice(0, 64) : '';
  const accentColor = pickColor(query.accent, DEFAULT_ACCENT_COLOR);
  const backgroundColor = pickColor(query.bg, DEFAULT_BG_COLOR);
  const textColor = pickColor(query.text, DEFAULT_TEXT_COLOR);
  const cacheBust = query.cb ? query.cb.toString() : null;
  const bucketedNow = bucketNow(Date.now(), bucketSeconds);

  const wantsGif = wantsAnimation(query);
  const useGif = wantsGif && allowGif;

  const computedCacheHeader =
      cacheHeader ||
      `public, max-age=0, s-maxage=${Math.max(1, bucketSeconds)}, stale-while-revalidate=30`;

  const nowForRender = bucketedNow;

  const buffer = useGif
      ? await buildCountdownGif({
        targetDate,
        label,
        subLabel,
        accentColor,
        backgroundColor,
        textColor,
        now: nowForRender,
        frameCount: gifFrameCount,
        delayCentisecs: gifDelayCs,
        bucketSeconds,
      })
      : await buildCountdownPng({
        targetDate,
        label,
        subLabel,
        accentColor,
        backgroundColor,
        textColor,
        now: nowForRender,
      });

  const headers = {
    'Content-Type': useGif ? 'image/gif' : 'image/png',
    'Cache-Control': computedCacheHeader,
  };

  return {
    ok: true,
    status: 200,
    headers,
    buffer,
    bucket: bucketedNow,
    usedGif: useGif,
    cacheBust,
  };
}

module.exports = {
  buildCountdownResponse,
  readConfigFromEnv,
  DEFAULT_CACHE_HEADER,
  DEFAULT_BUCKET_SECONDS,
  DEFAULT_GIF_FRAMES,
  DEFAULT_GIF_DELAY_CS,
  bucketNow,
};
