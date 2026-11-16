const { Op } = require('sequelize');
const AppError = require('./AppError');
const { clientInfo } = require('./http');

// Small helpers shared by the school workspace services (/api/v1/user/*).

// Everything a school service needs to know about the caller, built once in the controller:
//   const ctx = School.ctx(req)   -> { user, client, access, ip, userAgent }
// `user` is req.user (with role and permissions), `client` the school, `access` the subscription entitlements.
const ctx = (req) => {
  const { ip, userAgent } = clientInfo(req);
  return { user: req.user, client: req.client, access: req.access, ip, userAgent };
};

// today's date (YYYY-MM-DD) in the school's own time zone
const today = (client) => {
  const timeZone = (client && client.timezone) || 'Asia/Kolkata';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

// first and last day (YYYY-MM-DD) of the month that holds `date`
const monthRange = (date) => {
  const [year, month] = date.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n) => String(n).padStart(2, '0');
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
};

// a case-insensitive "contains" filter; % and _ typed by the user are matched literally
const contains = (text) => ({ [Op.iLike]: `%${String(text).replace(/[\\%_]/g, (c) => `\\${c}`)}%` });

// a case-insensitive "equals" filter
const equalsIgnoreCase = (text) => ({ [Op.iLike]: String(text).replace(/[\\%_]/g, (c) => `\\${c}`) });

// Refuses to add one more when the plan limit is reached. `key` is a limit key from config/plans.js.
// A missing limit (null) means unlimited.
const ensureWithinLimit = (access, key, currentCount, label) => {
  const limit = access && access.limits ? access.limits[key] : null;
  if (limit === null || limit === undefined) return;
  if (Number(currentCount) >= Number(limit)) {
    throw new AppError(403, `Your plan allows up to ${limit} ${label}. Please upgrade your plan to add more.`, {
      code: 'PLAN_LIMIT_REACHED',
    });
  }
};

// a TIME column ("09:30:00") as "09:30"
const hhmm = (value) => (value ? String(value).slice(0, 5) : null);

module.exports = { ctx, today, monthRange, contains, equalsIgnoreCase, ensureWithinLimit, hhmm };
