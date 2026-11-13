const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const safeSetting = require('@app/Helpers/safeSetting');
const { addDays, todayIn } = require('@app/Helpers/dateRange');

// Small helpers shared by the analytics datasets of agent 20 (renewals, inquiries, plans, security, system, announcements).
// This folder is NOT scanned by the registry (only ./definitions is), so it is safe to keep helpers here.

const DAY_MS = 86400000;

const select = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

// GST rate from the platform settings (billing.gst_rate_percent), 18 when it is not available
const gstRate = async () => {
  const rate = Number(await safeSetting('billing.gst_rate_percent', 18));
  return Number.isFinite(rate) && rate >= 0 ? rate : 18;
};

// The amount of a plan WITHOUT GST, in paise. A tax-inclusive plan has the GST taken out of its price;
// a plan that is not tax inclusive already holds the price without GST. Needs the :gstRate replacement.
const exGstSql = (planAlias = 'p') =>
  `(CASE WHEN ${planAlias}.tax_inclusive = 1 THEN ROUND(${planAlias}.price_paise * 100.0 / (100 + :gstRate)) ELSE ${planAlias}.price_paise END)::bigint`;

// "ravi.kumar@example.com" -> "ra***@e***.com" (enough to recognise, not enough to expose)
const maskEmail = (email) => {
  const value = String(email || '').trim();
  const at = value.lastIndexOf('@');
  if (at < 1) return value ? `${value.slice(0, 2)}***` : '-';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local.slice(0, 2)}***@${host.slice(0, 1)}***${tld}`;
};

// percent with one decimal, 0 when there is nothing to divide by
const percentOf = (part, whole) => {
  const total = Number(whole);
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.round((Number(part) / total) * 1000) / 10;
};

const round1 = (value) => Math.round((Number(value) || 0) * 10) / 10;

// the next N days from today in India: { today, days: ['2026-11-11', ...], from (Date, start of today), until (Date, exclusive end) }
const nextDays = (count, now = new Date()) => {
  const today = todayIn(now);
  const days = [];
  for (let index = 0; index < count; index += 1) days.push(addDays(today, index));
  return { today, days, from: now, until: new Date(`${addDays(today, count)}T00:00:00+05:30`) };
};

// a synthetic daily range for bucketLabels(): the next N days
const dailyRange = (days) => ({ granularity: 'day', from: days[0], to: days[days.length - 1] });

// whole days from `now` to a date (positive = in the future)
const daysUntil = (date, now = new Date()) => Math.ceil((new Date(date).getTime() - now.getTime()) / DAY_MS);

module.exports = { DAY_MS, select, gstRate, exGstSql, maskEmail, percentOf, round1, nextDays, dailyRange, daysUntil };
