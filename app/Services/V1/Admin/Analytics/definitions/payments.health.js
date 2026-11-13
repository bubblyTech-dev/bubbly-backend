const optionSets = require('../../Reports/optionSets');
const { bucketLabels, bucketSql, fillBuckets, kpi } = require('../series');
const { select } = require('../helpers/billingSql');

// ANALYTICS: Payments health (area "payments-health"). Money is in paise.
//
// What it answers: do payments go through, why do they fail, how much is refunded,
// and how payments split by method and by Online / Offline.
//
// Filters honoured
//   plan    the plan of the subscription the payment belongs to
//   status  the payment's CURRENT status (Created, Authorized, Captured, Failed, Refunded, Partially refunded)
//   source  Online (Razorpay) or Offline
//
// Rules used on this page
//   - A payment is dated by when it was paid (or created, when it never got paid, for example a failed attempt).
//   - Successful = Captured, Refunded or Partially refunded (the money did arrive). Failed = Failed.
//     Created and Authorized payments are still in progress and are left out of the success rate.
//   - Success rate = successful / (successful + failed), as a percent.
//   - Collected = the amount of successful payments as the school paid it (it includes GST).
//   - Refund rate = refunded amount / collected amount. Refunded amount = what was given back (also includes GST).
//   - Average payment = collected / number of successful payments.
//   - Failure reasons use the text from the gateway, then its code, then "Unknown".

// the optional filters (fixed text; values are bound parameters)
const filterSql = (filters) => {
  let sql = '';
  const replacements = {};

  if (filters.plan) {
    sql += ' AND s.plan_id IN (:planIds)';
    replacements.planIds = filters.plan.ids;
  }
  if (filters.status) {
    sql += ' AND p.status IN (:statuses)';
    replacements.statuses = filters.status;
  }
  if (filters.source) {
    sql += ' AND p.source IN (:sources)';
    replacements.sources = filters.source;
  }

  return { sql, replacements };
};

// every query starts from the same filtered list of payments (alias v)
const withPayments = (extraSql, body) => `
  WITH pay AS (
    SELECT p.id, p.status, p.source, p.method, p.amount_paise, p.refunded_paise, p.razorpay_payment_id,
           COALESCE(NULLIF(TRIM(p.failure_reason), ''), NULLIF(TRIM(p.failure_code), ''), 'Unknown') AS failure_text,
           COALESCE(p.paid_at, p.created_at) AS event_at,
           pl.name AS plan_name, c.name AS school_name
      FROM payments p
      JOIN clients c ON c.id = p.client_id AND c.deleted_at IS NULL
      LEFT JOIN subscriptions s ON s.id = p.subscription_id
      LEFT JOIN plans pl ON pl.id = s.plan_id
     WHERE 1 = 1${extraSql}
  )
  ${body}`;

const percentOf = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

const totals = async (from, to, extra) => {
  const [row] = await select(
    withPayments(
      extra.sql,
      `SELECT COUNT(*) FILTER (WHERE v.status IN (3, 5, 6))::int AS successful,
              COUNT(*) FILTER (WHERE v.status = 4)::int AS failed,
              COALESCE(SUM(v.amount_paise) FILTER (WHERE v.status IN (3, 5, 6)), 0)::bigint AS collected,
              COALESCE(SUM(v.refunded_paise) FILTER (WHERE v.status IN (3, 5, 6)), 0)::bigint AS refunded
         FROM pay v WHERE v.event_at >= :from AND v.event_at <= :to`,
    ),
    { from, to, ...extra.replacements },
  );

  const successful = row.successful;
  const failed = row.failed;
  const collected = Number(row.collected);
  const refunded = Number(row.refunded);
  return {
    successRate: percentOf(successful, successful + failed),
    attempts: successful + failed,
    failed,
    collected,
    refunded,
    refundRate: percentOf(refunded, collected),
    average: successful > 0 ? Math.round(collected / successful) : 0,
  };
};

module.exports = {
  key: 'payments.health',
  area: 'payments-health',
  title: 'Payments health',
  description: 'Do payments go through, why do they fail, how much is refunded, and how payments split by method.',
  filters: ['plan', 'status', 'source'],
  statusKind: 'payment',
  sourceKind: 'payment',
  exportTable: 'recentFailed',

  async run({ range, filters }) {
    const extra = filterSql(filters);
    const buckets = bucketLabels(range);
    const labels = buckets.map((bucket) => bucket.label);
    const params = { from: range.fromDate, to: range.toDate, ...extra.replacements };

    // ---- payments per day / week / month by outcome ----
    const perBucket = await select(
      withPayments(
        extra.sql,
        `SELECT ${bucketSql(range.granularity, 'v.event_at')} AS bucket,
                COUNT(*) FILTER (WHERE v.status = 3)::int AS captured,
                COUNT(*) FILTER (WHERE v.status IN (5, 6))::int AS refunded,
                COUNT(*) FILTER (WHERE v.status = 4)::int AS failed,
                COUNT(*) FILTER (WHERE v.status IN (1, 2))::int AS pending
           FROM pay v WHERE v.event_at >= :from AND v.event_at <= :to GROUP BY 1`,
      ),
      params,
    );
    const captured = fillBuckets(perBucket, buckets, 'captured');
    const refundedCount = fillBuckets(perBucket, buckets, 'refunded');
    const failedCount = fillBuckets(perBucket, buckets, 'failed');
    const pendingCount = fillBuckets(perBucket, buckets, 'pending');
    const successRateTrend = buckets.map((_, index) => percentOf(captured[index] + refundedCount[index], captured[index] + refundedCount[index] + failedCount[index]));

    const now = await totals(range.fromDate, range.toDate, extra);
    const before = range.previous ? await totals(range.previous.fromDate, range.previous.toDate, extra) : null;

    // ---- why payments fail, how people pay ----
    const reasons = await select(
      withPayments(extra.sql, `SELECT v.failure_text AS label, COUNT(*)::int AS value FROM pay v WHERE v.status = 4 AND v.event_at >= :from AND v.event_at <= :to GROUP BY 1 ORDER BY value DESC, label LIMIT 8`),
      params,
    );
    const methods = await select(
      withPayments(
        extra.sql,
        `SELECT (CASE WHEN v.source = 2 THEN 'Offline' ELSE COALESCE(INITCAP(NULLIF(TRIM(v.method), '')), 'Other') END) AS label, COUNT(*)::int AS value
           FROM pay v WHERE v.status IN (3, 5, 6) AND v.event_at >= :from AND v.event_at <= :to GROUP BY 1 ORDER BY value DESC, label`,
      ),
      params,
    );
    const sources = await select(
      withPayments(extra.sql, `SELECT v.source AS code, COUNT(*)::int AS value FROM pay v WHERE v.status IN (3, 5, 6) AND v.event_at >= :from AND v.event_at <= :to GROUP BY v.source ORDER BY v.source`),
      params,
    );

    // ---- the latest failed payments ----
    const recentFailed = await select(
      withPayments(
        extra.sql,
        `SELECT v.event_at AS "occurredAt", v.school_name AS school, v.plan_name AS "planName", v.amount_paise AS "amountPaise",
                (CASE WHEN v.source = 2 THEN 'Offline' ELSE COALESCE(INITCAP(NULLIF(TRIM(v.method), '')), 'Other') END) AS method,
                v.failure_text AS reason, v.razorpay_payment_id AS "paymentId"
           FROM pay v WHERE v.status = 4 AND v.event_at >= :from AND v.event_at <= :to
          ORDER BY v.event_at DESC, v.id DESC LIMIT 200`,
      ),
      params,
    );

    return {
      kpis: [
        kpi({ key: 'successRate', label: 'Success rate', value: now.successRate, previous: before?.successRate, unit: 'percent', sparkline: successRateTrend }),
        kpi({ key: 'attempts', label: 'Payment attempts', value: now.attempts, previous: before?.attempts }),
        kpi({ key: 'collected', label: 'Collected', value: now.collected, previous: before?.collected, unit: 'money' }),
        kpi({ key: 'failed', label: 'Failed payments', value: now.failed, previous: before?.failed, sparkline: failedCount }),
        kpi({ key: 'refundRate', label: 'Refund rate', value: now.refundRate, previous: before?.refundRate, unit: 'percent' }),
        kpi({ key: 'refunded', label: 'Refunded', value: now.refunded, previous: before?.refunded, unit: 'money' }),
        kpi({ key: 'average', label: 'Average payment', value: now.average, previous: before?.average, unit: 'money' }),
      ],
      series: {
        outcomes: {
          labels,
          datasets: [
            { key: 'captured', label: 'Paid', data: captured },
            { key: 'refunded', label: 'Refunded', data: refundedCount },
            { key: 'failed', label: 'Failed', data: failedCount },
            { key: 'pending', label: 'In progress', data: pendingCount },
          ],
        },
        failures: { labels, datasets: [{ key: 'failed', label: 'Failed payments', data: failedCount }] },
        successRate: { labels, datasets: [{ key: 'rate', label: 'Success rate', data: successRateTrend, unit: 'percent' }] },
      },
      breakdowns: {
        failureReasons: reasons.map((row) => ({ label: row.label, value: row.value })),
        byMethod: methods.map((row) => ({ label: row.label, value: row.value })),
        bySource: sources.map((row) => ({ label: optionSets.label('billingSource', row.code), value: row.value })),
      },
      tables: {
        recentFailed: {
          columns: [
            { key: 'occurredAt', label: 'When', type: 'datetime' },
            { key: 'school', label: 'School', type: 'text' },
            { key: 'planName', label: 'Plan', type: 'text' },
            { key: 'amountPaise', label: 'Amount', type: 'money' },
            { key: 'method', label: 'Method', type: 'text' },
            { key: 'reason', label: 'Why it failed', type: 'text' },
            { key: 'paymentId', label: 'Razorpay payment', type: 'text' },
          ],
          rows: recentFailed.map((row) => ({ ...row, amountPaise: Number(row.amountPaise) })),
        },
      },
    };
  },
};
