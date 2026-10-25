const AppError = require('@app/Helpers/AppError');

// Simple in-memory limiter, per IP and per name. Fine for one server. Use Redis once there are several.
//   rateLimit()                                       100 requests a minute (the public group)
//   rateLimit({ name: 'login', max: 10 })             10 a minute, counted separately from the rest
const hits = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
}, 60000).unref();

const rateLimit = ({ name = 'default', windowMs = 60000, max = 100, message } = {}) => (req, res, next) => {
  const key = `${name}:${req.ip}`;
  const now = Date.now();
  let entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    hits.set(key, entry);
  }
  entry.count += 1;

  res.setHeader('RateLimit-Limit', max);
  res.setHeader('RateLimit-Remaining', Math.max(0, max - entry.count));
  if (entry.count > max) {
    res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
    throw AppError.tooMany(message);
  }
  next();
};

module.exports = rateLimit;
