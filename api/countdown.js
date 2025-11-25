const {
  buildCountdownResponse,
  readConfigFromEnv,
} = require('../src/countdown-core');

const config = readConfigFromEnv();

module.exports = async function handler(req, res) {
  try {
    const result = await buildCountdownResponse(req.query || {}, config);
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
};
