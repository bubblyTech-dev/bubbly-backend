const { paged, toNumbers, oneRowToNumbers, applyCommonFilters, paymentFromSql, refundEventSql, PAID_AT, TAXABLE, GST } = require('../lib/sql');

// One row per day: what was collected (without GST, the GST, and the total paid), what was refunded, and the net.
// A refund is counted on the day of the latest refund event of its payment (see the refunds register).
module.exports = {
  key: 'billing.daily',
  area: 'billing',
  title: 'Daily collection',
  description: 'Money collected and refunded each day (India time). Taxable value is without GST; net = collected minus refunds.',
  usesDateRange: true,

  filters: [
    { key: 'source', label: 'Source', type: 'select', options: 'billingSource' },
    { key: 'plan', label: 'Plan', type: 'select', options: 'plans' },
  ],

  columns: [
    { key: 'day', label: 'Date', type: 'date', width: 14 },
    { key: 'payments', label: 'Payments', type: 'integer', width: 11 },
    { key: 'taxablePaise', label: 'Taxable value', type: 'money', width: 16 },
    { key: 'gstPaise', label: 'GST', type: 'money', width: 14 },
    { key: 'collectedPaise', label: 'Collected', type: 'money', width: 16 },
    { key: 'refundsPaise', label: 'Refunds', type: 'money', width: 14 },
    { key: 'netPaise', label: 'Net', type: 'money', width: 16 },
  ],

  async run({ range, filters, page, perPage }) {
    const replacements = { from: range.fromDate, to: range.toDate };
    const collectedWhere = ['p.status IN (3, 5, 6)', `${PAID_AT} >= :from`, `${PAID_AT} <= :to`];
    await applyCommonFilters(filters, collectedWhere, replacements, { plan: 's', source: 'p', client: 'c' });

    const refundedAt = 'COALESCE(r.created_at, p.updated_at)';
    const refundedWhere = ['p.refunded_paise > 0', `${refundedAt} >= :from`, `${refundedAt} <= :to`];
    if (filters.plan) refundedWhere.push('s.plan_id = :planId');
    if (filters.source !== undefined) refundedWhere.push('p.source = :source');

    const sql = `WITH collected AS (
                   SELECT (${PAID_AT} AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*)::int AS payments,
                          COALESCE(SUM(${TAXABLE}), 0) AS taxable, COALESCE(SUM(${GST}), 0) AS gst, COALESCE(SUM(p.amount_paise), 0) AS collected
                     ${paymentFromSql()}
                    WHERE ${collectedWhere.join(' AND ')}
                    GROUP BY 1
                 ), refunded AS (
                   SELECT (${refundedAt} AT TIME ZONE 'Asia/Kolkata')::date AS day, COALESCE(SUM(p.refunded_paise), 0) AS refunds
                     ${paymentFromSql()}
                     ${refundEventSql('r', 'p')}
                    WHERE ${refundedWhere.join(' AND ')}
                    GROUP BY 1
                 )
                 SELECT to_char(COALESCE(c.day, f.day), 'YYYY-MM-DD') AS day, COALESCE(c.payments, 0)::int AS payments,
                        COALESCE(c.taxable, 0)::float8 AS "taxablePaise", COALESCE(c.gst, 0)::float8 AS "gstPaise",
                        COALESCE(c.collected, 0)::float8 AS "collectedPaise", COALESCE(f.refunds, 0)::float8 AS "refundsPaise",
                        (COALESCE(c.collected, 0) - COALESCE(f.refunds, 0))::float8 AS "netPaise"
                   FROM collected c
                   FULL OUTER JOIN refunded f ON f.day = c.day
                  ORDER BY COALESCE(c.day, f.day) DESC`;

    const totalsSql = `SELECT COALESCE(SUM(t.payments), 0)::int AS payments, COALESCE(SUM(t."taxablePaise"), 0)::float8 AS "taxablePaise",
                              COALESCE(SUM(t."gstPaise"), 0)::float8 AS "gstPaise", COALESCE(SUM(t."collectedPaise"), 0)::float8 AS "collectedPaise",
                              COALESCE(SUM(t."refundsPaise"), 0)::float8 AS "refundsPaise", COALESCE(SUM(t."netPaise"), 0)::float8 AS "netPaise"
                         FROM (${sql}) t`;

    const result = await paged({ sql, replacements, page, perPage, totalsSql });

    return {
      rows: toNumbers(result.rows, ['taxablePaise', 'gstPaise', 'collectedPaise', 'refundsPaise', 'netPaise']),
      total: result.total,
      totals: oneRowToNumbers(result.totals, ['taxablePaise', 'gstPaise', 'collectedPaise', 'refundsPaise', 'netPaise']),
    };
  },
};
