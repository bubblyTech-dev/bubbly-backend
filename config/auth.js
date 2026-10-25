require('dotenv').config({ quiet: true });

const env = process.env.NODE_ENV || 'development';
const accessSecret = process.env.JWT_ACCESS_SECRET || '';

// stop at startup with a clear message instead of failing on the first login
if (accessSecret.length < 32) {
  throw new Error('JWT_ACCESS_SECRET is missing or shorter than 32 characters. Set it in .env (see .env.example).');
}

const parseSeconds = (value, fallback) => {
  const match = /^(\d+)\s*(s|m|h|d)?$/.exec(String(value || '').trim());
  if (!match) return fallback;
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] || 's'];
  return Number(match[1]) * unit;
};

module.exports = {
  accessSecret,
  accessTtlSeconds: parseSeconds(process.env.JWT_ACCESS_TTL, 900), // 15 minutes
  issuer: 'bubbly',
  adminAudience: 'bubbly-admin',

  refreshTtlDays: Number(process.env.REFRESH_TTL_DAYS) || 30,
  refreshCookieName: 'bubbly_admin_rt',
  refreshCookiePath: '/api/v1/admin/auth',
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : env === 'production',

  maxFailedLogins: 5,
  lockMinutes: 15,
  resetTtlMinutes: 60,

  adminAppUrl: process.env.ADMIN_APP_URL || 'http://localhost:5005',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5005')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === 'true',
};
