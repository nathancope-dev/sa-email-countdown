const express = require('express');
const {
  buildCountdownResponse,
  readConfigFromEnv,
  DEFAULT_CACHE_HEADER,
} = require('./countdown-core');

const app = express();
const PORT = process.env.PORT || 3000;
const config = readConfigFromEnv();

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.get('/countdown', async (req, res) => {
  try {
    const result = await buildCountdownResponse(req.query, config);
    if (!result.ok) {
      res.status(result.status).set(result.headers).json(result.body);
      return;
    }

    res.status(result.status);
    res.set(result.headers);
    res.setHeader('X-Countdown-Bucket', result.bucket.toString());
    if (result.cacheBust) {
      res.setHeader('X-Countdown-CB', result.cacheBust);
    }
    res.send(result.buffer);
  } catch (error) {
    console.error('Countdown rendering failed', error);
    res.status(500).json({ error: 'Failed to render countdown image' });
  }
});

app.get('/', (_req, res) => {
  res.type('text/plain').send(
    [
      'Countdown image service',
      'Usage:',
      '/countdown?target=2024-12-31T23:59:59Z&label=Sale%20ends%20in&accent=%23f472b6&bg=%230f172a&animated=1',
      `Cache-Control: ${config.cacheHeader || DEFAULT_CACHE_HEADER}`,
      `GIF allowed: ${config.allowGif}`,
      `Bucket seconds: ${config.bucketSeconds}`,
    ].join('\n'),
  );
});

app.listen(PORT, () => {
  console.log(`Countdown service listening on http://localhost:${PORT}`);
});
