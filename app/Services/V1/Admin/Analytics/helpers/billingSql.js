const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const Settings = require('@app/Helpers/settings');
const { fillBuckets, bucketLabels } = require('../series');

// Small helpers shared by the Schools, Subscriptions, Revenue and Payments health datasets.
// They live outside definitions/ on purpose: every file inside definitions/ is loaded as a dataset.

// Run one SQL statement with bound parameters.
const select = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

// The GST rate from the admin Settings (billing.gst_rate_percent). Used to take GST out of prices that include it.
const gstRatePercent = async () => Number(await Settings.get('billing.gst_rate_percent')) || 0;

// SQL text (fixed, no user input). Both need the replacement :gstRate.
//
//   periodPriceExGst('p')   the price of one billing period of plan alias p, WITHOUT GST
//   monthlyExGst('p', 's')  the same, as a monthly amount (quarterly / 3, yearly / 12)
//
// The plan price is used (not what a subscription happened to be charged) so the number does not move
// when GST is added on top of a tax-exclusive plan.
const periodPriceExGst = (plan = 'p') => `(CASE WHEN ${plan}.tax_inclusive = 1 THEN ${plan}.price_paise / (1 + :gstRate / 100.0) ELSE ${plan}.price_paise END)`;

const monthsIn = (plan = 'p', subscription = 's') => `(CASE COALESCE(${subscription}.billing_interval, ${plan}.billing_interval) WHEN 2 THEN 3 WHEN 3 THEN 12 ELSE 1 END)`;

const monthlyExGst = (plan = 'p', subscription = 's') => `(${periodPriceExGst(plan)} / ${monthsIn(plan, subscription)})`;

// The date a subscription started serving the school, and the date it stopped (null = still running).
// Pending subscriptions (nothing paid yet) never count.
const startedAtSql = (subscription = 's') => `COALESCE(${subscription}.started_at, ${subscription}.created_at)`;

const endedAtSql = (subscription = 's') =>
  `(CASE WHEN ${subscription}.status IN (4, 5) THEN COALESCE(${subscription}.ended_at, ${subscription}.cancelled_at, ${subscription}.current_period_end, ${subscription}.updated_at) ELSE ${subscription}.ended_at END)`;

// A range-like object for the previous period with the same bucket size as the current one
const previousRange = (range) => (range.previous ? { ...range.previous, granularity: range.granularity } : null);

// Numbers for the previous period, lined up with the current buckets (padded with 0 or cut to the same length)
const alignPrevious = (rows, range, length) => {
  const previous = previousRange(range);
  if (!previous) return null;
  const values = fillBuckets(rows, bucketLabels(previous));
  return Array.from({ length }, (_, index) => values[index] ?? 0);
};

// the whole-number days between two dates, as a number with one decimal
const roundOne = (value) => (value === null || value === undefined ? 0 : Math.round(Number(value) * 10) / 10);

module.exports = { select, gstRatePercent, periodPriceExGst, monthlyExGst, startedAtSql, endedAtSql, previousRange, alignPrevious, roundOne };
