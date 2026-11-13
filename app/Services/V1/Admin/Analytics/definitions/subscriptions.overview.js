const optionSets = require('../../Reports/optionSets');
const { bucketLabels, bucketSql, fillBuckets, kpi } = require('../series');
const { select, gstRatePercent, periodPriceExGst, startedAtSql, endedAtSql, roundOne } = require('../helpers/billingSql');

// ANALYTICS: Subscriptions (area "subscriptions").
//
// What it answers: how many schools are subscribed, how many joined, left or lapsed in each period,
// how they split by plan, billing period and Online / Offline, and who needs a renewal in the next 30 days.
//
// Filters honoured
//   plan    the subscription's plan
//   status  the subscription's CURRENT status (the filter narrows every number on the page)
//   source  Online (Razorpay) or Offline
//
// Rules used on this page
//   - Pending subscriptions (nothing paid yet) are not counted as new, active or lost.
//   - "New" = a subscription that started in the period (the date it started, or was created when no start date exists).
//   - "Cancelled" = status Cancelled, dated by when it ended (end date, cancel date, period end, last update, in that order).
//   - "Expired" = status Expired, dated the same way.
//   - Net change = new - cancelled - expired.
//   - "Running" = Active, Past due or Suspended. The billing-period and Online / Offline splits count running subscriptions.
//   - Average age = days since an ACTIVE subscription started.
//   - Ending soon = Active subscriptions whose current period ends within 30 days from today.

// the optional filters (fixed text; values are bound parameters)
const filterSql = (filters) => {
  let sql = '';
  const replacements = {};

  if (filters.plan) {
    sql += ' AND s.plan_id IN (:planIds)';
    replacements.planIds = filters.plan.ids;
  }
  if (filters.status) {
    sql += ' AND s.status IN (:statuses)';
    replacements.statuses = filters.status;
  }
  if (filters.source) {
    sql += ' AND s.source IN (:sources)';
    replacements.sources = filters.source;
  }

  return { sql, replacements };
};

// every query starts from the same filtered list of subscriptions
const withBase = (extraSql, body) => `
  WITH base AS (
    SELECT s.id, s.status, s.source, s.cancel_at_cycle_end, s.current_period_end,
           COALESCE(s.billing_interval, p.billing_interval) AS bill_interval,
           ${startedAtSql('s')} AS start_at,
           ${endedAtSql('s')} AS end_at,
           p.id AS plan_id, p.name AS plan_name, c.name AS school_name,
           ${periodPriceExGst('p')} AS period_price
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      JOIN clients c ON c.id = s.client_id AND c.deleted_at IS NULL
     WHERE s.deleted_at IS NULL${extraSql}
  )
  ${body}`;

const eventCounts = async (from, to, extra, gstRate) => {
  const [row] = await select(
    withBase(
      extra.sql,
      `SELECT COUNT(*) FILTER (WHERE b.status <> 1 AND b.start_at >= :from AND b.start_at <= :to)::int AS added,
              COUNT(*) FILTER (WHERE b.status = 4 AND b.end_at >= :from AND b.end_at <= :to)::int AS cancelled,
              COUNT(*) FILTER (WHERE b.status = 5 AND b.end_at >= :from AND b.end_at <= :to)::int AS expired
         FROM base b`,
    ),
    { from, to, gstRate, ...extra.replacements },
  );
  return row;
};

module.exports = {
  key: 'subscriptions.overview',
  area: 'subscriptions',
  title: 'Subscriptions',
  description: 'How many schools are subscribed, who joined or left, and how subscriptions split by plan and billing period.',
  filters: ['plan', 'status', 'source'],
  statusKind: 'subscription',
  sourceKind: 'subscription',
  exportTable: 'endingSoon',

  async run({ range, filters }) {
    const extra = filterSql(filters);
    const buckets = bucketLabels(range);
    const labels = buckets.map((bucket) => bucket.label);
    const gstRate = await gstRatePercent();
    const base = { gstRate, ...extra.replacements };

    // ---- joined / cancelled / expired per day, week or month ----
    const events = await select(
      withBase(
        extra.sql,
        `SELECT bucket, kind, COUNT(*)::int AS value FROM (
            SELECT ${bucketSql(range.granularity, 'b.start_at')} AS bucket, 'new' AS kind FROM base b
             WHERE b.status <> 1 AND b.start_at >= :from AND b.start_at <= :to
            UNION ALL
            SELECT ${bucketSql(range.granularity, 'b.end_at')} AS bucket, 'cancelled' AS kind FROM base b
             WHERE b.status = 4 AND b.end_at >= :from AND b.end_at <= :to
            UNION ALL
            SELECT ${bucketSql(range.granularity, 'b.end_at')} AS bucket, 'expired' AS kind FROM base b
             WHERE b.status = 5 AND b.end_at >= :from AND b.end_at <= :to
          ) e GROUP BY bucket, kind`,
      ),
      { from: range.fromDate, to: range.toDate, ...base },
    );
    const perKind = (kind) => fillBuckets(events.filter((row) => row.kind === kind), buckets);
    const added = perKind('new');
    const cancelled = perKind('cancelled');
    const expired = perKind('expired');
    const net = added.map((value, index) => value - cancelled[index] - expired[index]);

    const current = await eventCounts(range.fromDate, range.toDate, extra, gstRate);
    const before = range.previous ? await eventCounts(range.previous.fromDate, range.previous.toDate, extra, gstRate) : null;

    // ---- today's picture ----
    const [today] = await select(
      withBase(
        extra.sql,
        `SELECT COUNT(*) FILTER (WHERE b.status = 2)::int AS active,
                AVG(GREATEST(0, EXTRACT(EPOCH FROM (NOW() - b.start_at)) / 86400.0)) FILTER (WHERE b.status = 2) AS "averageAge",
                COUNT(*) FILTER (WHERE b.status = 2 AND b.current_period_end >= NOW() AND b.current_period_end <= NOW() + INTERVAL '30 days')::int AS "endingSoon"
           FROM base b`,
      ),
      base,
    );

    const activeByPlan = await select(withBase(extra.sql, `SELECT b.plan_name AS label, COUNT(*)::int AS value FROM base b WHERE b.status = 2 GROUP BY b.plan_id, b.plan_name ORDER BY value DESC, b.plan_name LIMIT 12`), base);
    const byStatus = await select(withBase(extra.sql, `SELECT b.status AS code, COUNT(*)::int AS value FROM base b GROUP BY b.status ORDER BY b.status`), base);
    const byInterval = await select(withBase(extra.sql, `SELECT b.bill_interval AS code, COUNT(*)::int AS value FROM base b WHERE b.status IN (2, 3, 6) GROUP BY b.bill_interval ORDER BY b.bill_interval`), base);
    const bySource = await select(withBase(extra.sql, `SELECT b.source AS code, COUNT(*)::int AS value FROM base b WHERE b.status IN (2, 3, 6) GROUP BY b.source ORDER BY b.source`), base);

    const ending = await select(
      withBase(
        extra.sql,
        `SELECT b.school_name AS school, b.plan_name AS "planName", b.bill_interval AS "interval", b.source,
                b.current_period_end AS "endsOn",
                CEIL(EXTRACT(EPOCH FROM (b.current_period_end - NOW())) / 86400.0)::int AS "daysLeft",
                ROUND(b.period_price)::bigint AS "pricePaise",
                CASE WHEN b.cancel_at_cycle_end = 1 THEN 'Will stop at period end' ELSE 'Renews or lapses' END AS "outcome"
           FROM base b
          WHERE b.status = 2 AND b.current_period_end >= NOW() AND b.current_period_end <= NOW() + INTERVAL '30 days'
          ORDER BY b.current_period_end, b.school_name
          LIMIT 200`,
      ),
      base,
    );

    const netChange = current.added - current.cancelled - current.expired;
    const netBefore = before ? before.added - before.cancelled - before.expired : null;

    return {
      kpis: [
        kpi({ key: 'active', label: 'Active subscriptions', value: today.active }),
        kpi({ key: 'new', label: 'New subscriptions', value: current.added, previous: before?.added, sparkline: added }),
        kpi({ key: 'cancelled', label: 'Cancelled', value: current.cancelled, previous: before?.cancelled, sparkline: cancelled }),
        kpi({ key: 'expired', label: 'Expired', value: current.expired, previous: before?.expired, sparkline: expired }),
        kpi({ key: 'netChange', label: 'Net change', value: netChange, previous: netBefore, sparkline: net }),
        kpi({ key: 'averageAge', label: 'Average age of active', value: roundOne(today.averageAge), unit: 'days' }),
        kpi({ key: 'endingSoon', label: 'Ending in 30 days', value: today.endingSoon }),
      ],
      series: {
        lifecycle: {
          labels,
          datasets: [
            { key: 'new', label: 'New', data: added },
            { key: 'cancelled', label: 'Cancelled', data: cancelled },
            { key: 'expired', label: 'Expired', data: expired },
          ],
        },
        netChange: { labels, datasets: [{ key: 'net', label: 'Net change', data: net }] },
        activeByPlan: { labels: activeByPlan.map((row) => row.label), datasets: [{ key: 'subscriptions', label: 'Active subscriptions', data: activeByPlan.map((row) => row.value) }] },
      },
      breakdowns: {
        byStatus: byStatus.map((row) => ({ label: optionSets.label('subscriptionStatus', row.code), value: row.value })),
        byInterval: byInterval.map((row) => ({ label: optionSets.label('billingInterval', row.code), value: row.value })),
        bySource: bySource.map((row) => ({ label: optionSets.label('billingSource', row.code), value: row.value })),
      },
      tables: {
        endingSoon: {
          columns: [
            { key: 'school', label: 'School', type: 'text' },
            { key: 'planName', label: 'Plan', type: 'text' },
            { key: 'interval', label: 'Billed', type: 'text' },
            { key: 'source', label: 'Source', type: 'text' },
            { key: 'endsOn', label: 'Period ends', type: 'date' },
            { key: 'daysLeft', label: 'Days left', type: 'integer' },
            { key: 'pricePaise', label: 'Plan price (no GST)', type: 'money' },
            { key: 'outcome', label: 'What happens', type: 'text' },
          ],
          rows: ending.map((row) => ({
            ...row,
            interval: optionSets.label('billingInterval', row.interval),
            source: optionSets.label('billingSource', row.source),
            pricePaise: Number(row.pricePaise),
          })),
        },
      },
    };
  },
};
