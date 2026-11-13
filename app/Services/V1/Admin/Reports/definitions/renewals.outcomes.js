const { paged, toNumbers, oneRowToNumbers, planIdOf } = require('../lib/sql');

// Per month (India time): how many subscriptions renewed and how many lapsed.
//   Renewed = a payment received for a subscription that had already been paid before (not its first payment).
//   Lapsed  = a subscription that was cancelled or expired in that month.
//   Renewal rate = renewed / (renewed + lapsed).
module.exports = {
  key: 'renewals.outcomes',
  area: 'renewals',
  title: 'Renewal outcomes',
  description: 'Each month: renewals paid, subscriptions that lapsed, and the renewal rate. Revenue is without GST.',
  usesDateRange: true,

  filters: [
    { key: 'plan', label: 'Plan', type: 'select', options: 'plans' },
    { key: 'source', label: 'Source', type: 'select', options: 'billingSource' },
  ],

  columns: [
    { key: 'period', label: 'Month', type: 'text', width: 14 },
    { key: 'renewed', label: 'Renewed', type: 'integer', width: 11 },
    { key: 'renewedExGstPaise', label: 'Renewal revenue', type: 'money', width: 18 },
    { key: 'lapsed', label: 'Lapsed', type: 'integer', width: 10 },
    { key: 'net', label: 'Net (renewed - lapsed)', type: 'integer', width: 20 },
    { key: 'renewalRatePercent', label: 'Renewal rate', type: 'percent', width: 14 },
  ],

  async run({ range, filters, page, perPage }) {
    const replacements = { from: range.fromDate, to: range.toDate };
    const filterParts = [];
    if (filters.plan) {
      filterParts.push('s.plan_id = :planId');
      replacements.planId = await planIdOf(filters.plan);
    }
    if (filters.source !== undefined) {
      filterParts.push('s.source = :source');
      replacements.source = filters.source;
    }
    const extra = filterParts.length ? `AND ${filterParts.join(' AND ')}` : '';
    const ist = (column) => `(${column} AT TIME ZONE 'Asia/Kolkata')`;
    const endedAt = 'COALESCE(s.ended_at, s.cancelled_at, s.updated_at)';

    const sql = `WITH ordered AS (
                   SELECT p.id, p.subscription_id, p.client_id, COALESCE(p.paid_at, p.created_at) AS at,
                          ROW_NUMBER() OVER (PARTITION BY p.subscription_id ORDER BY COALESCE(p.paid_at, p.created_at), p.id) AS position
                     FROM payments p
                    WHERE p.status IN (3, 5, 6) AND p.subscription_id IS NOT NULL
                 ), renewed AS (
                   SELECT to_char(date_trunc('month', ${ist('o.at')}), 'YYYY-MM-DD') AS month, COUNT(*)::int AS renewed,
                          COALESCE(SUM(COALESCE(inv.subtotal_paise, pay.amount_paise)), 0) AS revenue
                     FROM ordered o
                     JOIN payments pay ON pay.id = o.id
                     JOIN subscriptions s ON s.id = o.subscription_id
                     LEFT JOIN LATERAL (SELECT i.subtotal_paise FROM invoices i WHERE i.payment_id = pay.id AND i.status <> 4 ORDER BY i.id DESC LIMIT 1) inv ON TRUE
                    WHERE o.position > 1 AND o.at >= :from AND o.at <= :to ${extra}
                    GROUP BY 1
                 ), lapsed AS (
                   SELECT to_char(date_trunc('month', ${ist(endedAt)}), 'YYYY-MM-DD') AS month, COUNT(*)::int AS lapsed
                     FROM subscriptions s
                    WHERE s.deleted_at IS NULL AND s.status IN (4, 5) AND ${endedAt} >= :from AND ${endedAt} <= :to ${extra}
                    GROUP BY 1
                 )
                 SELECT COALESCE(r.month, l.month) AS month, COALESCE(r.renewed, 0)::int AS renewed, COALESCE(r.revenue, 0)::float8 AS "renewedExGstPaise",
                        COALESCE(l.lapsed, 0)::int AS lapsed, (COALESCE(r.renewed, 0) - COALESCE(l.lapsed, 0))::int AS net
                   FROM renewed r
                   FULL OUTER JOIN lapsed l ON l.month = r.month
                  ORDER BY COALESCE(r.month, l.month) DESC`;

    const totalsSql = `SELECT COALESCE(SUM(t.renewed), 0)::int AS renewed, COALESCE(SUM(t."renewedExGstPaise"), 0)::float8 AS "renewedExGstPaise",
                              COALESCE(SUM(t.lapsed), 0)::int AS lapsed, COALESCE(SUM(t.net), 0)::int AS net
                         FROM (${sql}) t`;

    const result = await paged({ sql, replacements, page, perPage, totalsSql });

    const rate = (renewed, lapsed) => (renewed + lapsed > 0 ? Math.round((renewed / (renewed + lapsed)) * 1000) / 10 : null);

    const rows = toNumbers(result.rows, ['renewedExGstPaise']).map(({ month, ...row }) => ({
      period: new Date(`${month}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      ...row,
      renewalRatePercent: rate(row.renewed, row.lapsed),
    }));

    const totals = oneRowToNumbers(result.totals, ['renewedExGstPaise']);
    totals.renewalRatePercent = rate(totals.renewed || 0, totals.lapsed || 0);

    return { rows, total: result.total, totals };
  },
};
