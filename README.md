# Countdown Image Service

Lightweight Express service that renders a fresh PNG countdown image for use in email templates or landing pages. Drop the endpoint into an `<img>` tag and the timer will refresh every time the email is opened.

## Quick start

```bash
cd countdown
npm install
npm run start
# or for autoreload while developing
npm run dev
```

The service listens on port `3000` by default. Override with `PORT=4000 npm run start`.

## Usage

Request a countdown image with a target datetime:

```
GET /countdown?target=2024-12-31T23:59:59Z&label=Sale%20ends%20in&accent=%23f472b6&bg=%230f172a
```

- `target` (required): ISO datetime with timezone, e.g. `2024-12-31T23:59:59Z`
- `label` (optional): Top line of text, max 64 characters
- `accent` (optional): Accent bar hex color, default `#22d3ee`
- `bg` (optional): Background hex color, default `#0f172a`
- `text` (optional): Text hex color, default `#ffffff`
- `sub` (optional): Sub-label under the countdown, max 64 characters
- `animated` (optional): `1`/`true`/`gif` to return a lightweight ticking GIF (defaults to static PNG)
- `cb` (optional): Cache-busting token to force re-fetches in aggressive proxies (e.g., `&cb={{current_time_in_minutes}}`)

Example download:

```bash
curl -o countdown.png "http://localhost:3000/countdown?target=2024-12-31T23:59:59Z&label=Holiday%20Sale"
```

Embed in an email:

```html
<img
  src="https://your-domain.example/countdown?target=2024-12-31T23:59:59Z&label=Sale%20ends%20in"
  alt="Countdown timer"
  width="640"
  height="240"
/>
```

Use `animated=1` in the URL to return a GIF that visibly ticks down across the current time bucket (default 60s). With defaults, that’s 60 frames auto-spread across the bucket at ~1s cadence, looping within that clip. The server sets `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=30` (computed from the bucket) so caches should re-fetch each bucket. Set `ALLOW_GIF=false` to disable animations in production.

## Environment switches

- `ALLOW_GIF` (default `true`): Set to `false` to force PNG responses even if `animated=1`.
- `BUCKET_SECONDS` (default `60`): Round “now” into this window to reduce unique renders and improve cache hit rate.
- `CACHE_HEADER` (default auto: `public, max-age=0, s-maxage=<bucket>`): Override the cache directive if needed.
- `GIF_FRAMES` (default `60`, capped at `120`): Increase/decrease GIF length. With the default settings, frames auto-spread across the 60s bucket at ~1s cadence.
- `GIF_DELAY_CS` (default auto): Delay between GIF frames in centiseconds. Leave unset to auto-spread across the bucket; set explicitly for a custom cadence.
- `FONT_PATH` (optional): Absolute or relative path to a TTF/OTF font to register for rendering (Node serverless only; not Edge). Falls back to system sans-serif if not provided.
- `FONT_FAMILY` (optional): Font family name to use after registering `FONT_PATH` (default `CountdownSans`).
  - Bundled fonts: `src/fonts/Baskervville-Regular.ttf` (label) and `src/fonts/Gill Sans Light.otf` (value).

## Vercel deployment

- Use the provided `api/countdown.js` (Node serverless function, not Edge).
- Set env vars in Vercel (e.g., `ALLOW_GIF=false`, `BUCKET_SECONDS=60`). If you want a custom cache policy, set `CACHE_HEADER`, otherwise it auto-uses `public, max-age=0, s-maxage=<bucket>, stale-while-revalidate=30`.
- To force fresh fetches in email proxies that cache by URL, append `&cb={{current_time_in_minutes}}` (or similar) in your email template.
- Point your email `<img>` to `https://your-vercel-domain.vercel.app/api/countdown?...`. The CDN will honor the cache headers and bucketed timestamps to absorb traffic spikes.
