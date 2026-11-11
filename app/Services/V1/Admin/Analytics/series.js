const AppError = require('@app/Helpers/AppError');
const { TIMEZONE, addDays, addMonths, toDayNumber } = require('@app/Helpers/dateRange');

// Helpers for time series (charts over days, weeks or months).
//
//   const buckets = bucketLabels(range);                                    // [{ key, label, from, to }, ...]
//   const rows = await sequelize.query(
//     `SELECT ${bucketSql(range.granularity, 'p.paid_at')} AS bucket, COUNT(*)::int AS value FROM payments p WHERE ... GROUP BY 1`, ...);
//   const data = fillBuckets(rows, buckets);                                // one number per bucket, zero where nothing happened
//
// Buckets follow the business calendar (Asia/Kolkata): weeks start on Monday, months are calendar months.

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dayLabel = (isoDate) => {
  const [, month, day] = isoDate.split('-').map(Number);
  return `${String(day).padStart(2, '0')} ${MONTH_NAMES[month - 1]}`;
};

// Monday of the week that holds a date (day number 0 is a Thursday, so +3 aligns Monday to 0)
const mondayOf = (isoDate) => {
  const daysSinceMonday = (((toDayNumber(isoDate) + 3) % 7) + 7) % 7;
  return addDays(isoDate, -daysSinceMonday);
};

// the buckets that cover a range, in order
const bucketLabels = (range) => {
  const buckets = [];

  if (range.granularity === 'day') {
    for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
      buckets.push({ key: day, label: dayLabel(day), from: day, to: day });
    }
    return buckets;
  }

  if (range.granularity === 'week') {
    for (let monday = mondayOf(range.from); monday <= range.to; monday = addDays(monday, 7)) {
      buckets.push({ key: monday, label: dayLabel(monday), from: monday < range.from ? range.from : monday, to: addDays(monday, 6) > range.to ? range.to : addDays(monday, 6) });
    }
    return buckets;
  }

  for (let month = `${range.from.slice(0, 7)}-01`; month <= range.to; month = addMonths(month, 1)) {
    const [year, number] = month.split('-').map(Number);
    buckets.push({
      key: month.slice(0, 7),
      label: `${MONTH_NAMES[number - 1]} ${year}`,
      from: month < range.from ? range.from : month,
      to: addDays(addMonths(month, 1), -1) > range.to ? range.to : addDays(addMonths(month, 1), -1),
    });
  }
  return buckets;
};

const COLUMN_PATTERN = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;

// SQL text that turns a timestamp column into its bucket key ('2026-10-05', or '2026-10' for months).
// The column name is written by the definition author, never taken from a request, and is checked anyway.
const bucketSql = (granularity, column) => {
  if (!COLUMN_PATTERN.test(column)) throw new Error(`Unsafe column name "${column}".`);

  const local = `${column} AT TIME ZONE '${TIMEZONE}'`;
  if (granularity === 'day') return `to_char(date_trunc('day', ${local}), 'YYYY-MM-DD')`;
  if (granularity === 'week') return `to_char(date_trunc('week', ${local}), 'YYYY-MM-DD')`;
  if (granularity === 'month') return `to_char(date_trunc('month', ${local}), 'YYYY-MM')`;
  throw new Error(`Unknown granularity "${granularity}".`);
};

// rows [{ bucket, value }] -> numbers aligned with the buckets (0 where a bucket has no row)
const fillBuckets = (rows, buckets, valueKey = 'value') => {
  const byKey = new Map();
  for (const row of rows) byKey.set(String(row.bucket), Number(row[valueKey]) || 0);
  return buckets.map((bucket) => byKey.get(bucket.key) ?? 0);
};

// 12.5 means +12.5%; null when there is nothing to compare with
const percentChange = (current, previous) => {
  const now = Number(current);
  const before = Number(previous);
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null;
  return Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
};

const toRupees = (paise) => Math.round(Number(paise) || 0) / 100;

// a KPI object with its change against the previous period filled in
const kpi = ({ key, label, value, previous, unit = 'count', sparkline }) => ({
  key,
  label,
  value: Number(value) || 0,
  previous: previous === undefined || previous === null ? null : Number(previous) || 0,
  change: previous === undefined || previous === null ? null : percentChange(value, previous),
  unit,
  ...(sparkline ? { sparkline } : {}),
});

// "a,b,c" or ['a','b'] -> ['a','b','c']
const toList = (value) => {
  if (value === undefined || value === null || value === '') return [];
  const items = Array.isArray(value) ? value : String(value).split(',');
  return items.map((item) => String(item).trim()).filter(Boolean);
};

const toIntegerList = (value, field) => {
  const items = toList(value);
  const numbers = items.map(Number);
  if (numbers.some((number) => !Number.isInteger(number))) {
    throw AppError.validation({ [field]: ['The selected values are not valid.'] });
  }
  return numbers;
};

module.exports = { bucketLabels, bucketSql, fillBuckets, percentChange, toRupees, kpi, toList, toIntegerList, mondayOf };
