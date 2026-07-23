function requireApiKey(req, res, next) {
  const key = req.get('X-API-Key');

  if (!key || key !== process.env.INGEST_API_KEY) {
    return res.status(401).json({ error: 'Missing or invalid API key' });
  }

  next();
}

module.exports = { requireApiKey };
