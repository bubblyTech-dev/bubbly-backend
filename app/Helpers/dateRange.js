const AppError = require('@app/Helpers/AppError');

// Date ranges for analytics and reports.
//
//   const range = resolveRange({ preset: 'last_30_days', compare: true }, { fiscalStartMonth: 4 });
//   range.from / range.to           'YYYY-MM-DD' (inclusive, in the business timezone)
//   range.fromDate / range.toDate   JS Dates: start of the first day and the last millisecond of the last day
//   range.previous                  the same-length window right before (only when compare is true)
//   range.granularity               'day' | 'week' | 'month', chosen from the length of the range
//
// Everything is calculated in the business timezone (Asia/Kolkata), never in the server's timezone.

const TIMEZONE = 'Asia/Kolkata';
const DAY_MS = 86400000;

const PRESETS = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'last_12_months',
  'this_month',
  'last_month',
  'this_quarter',
  'this_fiscal_year',
  'last_fiscal_year',
  'custom',
];

const MAX_CUSTOM_DAYS = 366 * 5;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const formatters = new Map();

const formatterFor = (timezone) => {
  if (!formatters.has(timezone)) {
    formatters.set(
      timezone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    );
  }
  return formatters.get(timezone);
};

// the calendar fields of an instant, as seen in the timezone
const zonedParts = (date, timezone = TIMEZONE) => {
  const parts = {};
  for (const part of formatterFor(timezone).formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
};

const offsetMinutes = (date, timezone) => {
  const parts = zonedParts(date, timezone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
};

// the instant at 00:00:00.000 of a calendar day in the timezone
const startOfZonedDay = (year, month, day, timezone = TIMEZONE) => {
  const guess = Date.UTC(year, month - 1, day);
  const first = offsetMinutes(new Date(guess), timezone);
  let instant = guess - first * 60000;
  const second = offsetMinutes(new Date(instant), timezone);
  if (second !== first) instant = guess - second * 60000;
  return new Date(instant);
};

// ---- calendar arithmetic on 'YYYY-MM-DD' strings (no timezone involved) ----

const pad = (number) => String(number).padStart(2, '0');

const toDayNumber = (isoDate) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
};

const fromDayNumber = (dayNumber) => {
  const date = new Date(dayNumber * DAY_MS);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

const addDays = (isoDate, days) => fromDayNumber(toDayNumber(isoDate) + days);

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const addMonths = (isoDate, months) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const total = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${nextYear}-${pad(nextMonth)}-${pad(Math.min(day, daysInMonth(nextYear, nextMonth)))}`;
};

const isRealDate = (isoDate) => {
  if (!DATE_PATTERN.test(isoDate)) return false;
  const [year, month, day] = isoDate.split('-').map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
};

const todayIn = (now, timezone) => {
  const parts = zonedParts(now, timezone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
};

// ---- fiscal year ----

// The financial year that contains a date. startMonth 4 = April to March (India), 1 = calendar year.
const fiscalYearOf = (isoDateOrDate, startMonth = 4, timezone = TIMEZONE) => {
  const isoDate = typeof isoDateOrDate === 'string' ? isoDateOrDate : todayIn(isoDateOrDate, timezone);
  const [year, month] = isoDate.split('-').map(Number);
  const startYear = month >= startMonth ? year : year - 1;
  const from = `${startYear}-${pad(startMonth)}-01`;
  const to = addDays(addMonths(from, 12), -1);
  const endYear = Number(to.slice(0, 4));

  const label = startMonth === 1 ? `FY ${startYear}` : `FY ${startYear}-${String(endYear).slice(2)}`;
  return { startYear, endYear, from, to, label };
};

const fiscalYearLabel = (isoDateOrDate, startMonth = 4, timezone = TIMEZONE) => fiscalYearOf(isoDateOrDate, startMonth, timezone).label;

// the first day of the fiscal quarter that contains a date (quarters follow the fiscal year)
const fiscalQuarterStart = (isoDate, startMonth) => {
  const fiscalYear = fiscalYearOf(isoDate, startMonth);
  const [, month] = isoDate.split('-').map(Number);
  const monthsIntoYear = (month - startMonth + 12) % 12;
  return addMonths(fiscalYear.from, Math.floor(monthsIntoYear / 3) * 3);
};

// ---- presets ----

const presetBounds = (preset, today, fiscalStartMonth) => {
  const monthStart = `${today.slice(0, 7)}-01`;

  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case 'last_7_days':
      return { from: addDays(today, -6), to: today };
    case 'last_30_days':
      return { from: addDays(today, -29), to: today };
    case 'last_90_days':
      return { from: addDays(today, -89), to: today };
    case 'last_12_months':
      return { from: addDays(addMonths(today, -12), 1), to: today };
    case 'this_month':
      return { from: monthStart, to: today };
    case 'last_month': {
      const from = addMonths(monthStart, -1);
      return { from, to: addDays(monthStart, -1) };
    }
    case 'this_quarter':
      return { from: fiscalQuarterStart(today, fiscalStartMonth), to: today };
    case 'this_fiscal_year':
      return { from: fiscalYearOf(today, fiscalStartMonth).from, to: today };
    case 'last_fiscal_year': {
      const current = fiscalYearOf(today, fiscalStartMonth);
      const previous = fiscalYearOf(addDays(current.from, -1), fiscalStartMonth);
      return { from: previous.from, to: previous.to };
    }
    default:
      return null;
  }
};

const spanInDays = (from, to) => toDayNumber(to) - toDayNumber(from) + 1;

// day charts for up to 45 days, week charts up to about 6 months, month charts beyond that
const granularityFor = (days) => {
  if (days <= 45) return 'day';
  if (days <= 190) return 'week';
  return 'month';
};

const build = (from, to, timezone) => {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const [nextYear, nextMonth, nextDay] = addDays(to, 1).split('-').map(Number);
  const fromDate = startOfZonedDay(fromYear, fromMonth, fromDay, timezone);
  // both ends are inclusive: toDate is the last millisecond of the last day
  const toDate = new Date(startOfZonedDay(nextYear, nextMonth, nextDay, timezone).getTime() - 1);
  const days = spanInDays(from, to);

  return { from, to, fromDate, toDate, days, granularity: granularityFor(days) };
};

const truthy = (value) => value === true || value === 1 || value === '1' || value === 'true';

// input: { preset, from, to, compare }. Throws a 422 for an invalid custom range.
const resolveRange = (input = {}, options = {}) => {
  const timezone = options.timezone || TIMEZONE;
  const now = options.now || new Date();
  const fiscalStartMonth = Number(options.fiscalStartMonth) >= 1 && Number(options.fiscalStartMonth) <= 12 ? Number(options.fiscalStartMonth) : 4;
  const preset = input.preset || options.defaultPreset || 'last_30_days';

  if (!PRESETS.includes(preset)) {
    throw AppError.validation({ preset: ['Choose a valid date range.'] });
  }

  const today = todayIn(now, timezone);
  let bounds;

  if (preset === 'custom') {
    const { from, to } = input;
    if (!from || !to) throw AppError.validation({ from: ['Choose a start and an end date.'] });
    if (!isRealDate(from)) throw AppError.validation({ from: ['The start date is not a valid date.'] });
    if (!isRealDate(to)) throw AppError.validation({ to: ['The end date is not a valid date.'] });
    if (from > to) throw AppError.validation({ to: ['The end date must be on or after the start date.'] });
    if (spanInDays(from, to) > MAX_CUSTOM_DAYS) throw AppError.validation({ to: ['The range can be at most 5 years.'] });
    bounds = { from, to };
  } else {
    bounds = presetBounds(preset, today, fiscalStartMonth);
  }

  const current = build(bounds.from, bounds.to, timezone);
  let previous = null;

  if (truthy(input.compare)) {
    const previousTo = addDays(current.from, -1);
    const previousFrom = addDays(previousTo, -(current.days - 1));
    const window = build(previousFrom, previousTo, timezone);
    previous = { from: window.from, to: window.to, fromDate: window.fromDate, toDate: window.toDate, days: window.days };
  }

  return {
    preset,
    ...current,
    timezone,
    fiscalYear: fiscalYearOf(today, fiscalStartMonth, timezone),
    previous,
  };
};

// what the API sends to the browser (Dates become ISO strings)
const rangeForResponse = (range) => ({
  preset: range.preset,
  from: range.from,
  to: range.to,
  days: range.days,
  granularity: range.granularity,
  timezone: range.timezone,
  fiscalYear: range.fiscalYear.label,
  previous: range.previous ? { from: range.previous.from, to: range.previous.to, days: range.previous.days } : null,
});

module.exports = {
  TIMEZONE,
  PRESETS,
  resolveRange,
  rangeForResponse,
  fiscalYearOf,
  fiscalYearLabel,
  zonedParts,
  startOfZonedDay,
  todayIn,
  addDays,
  addMonths,
  toDayNumber,
  fromDayNumber,
  isRealDate,
};
