const { paged, toNumbers, oneRowToNumbers, applyCommonFilters } = require('../lib/sql');
const optionSets = require('../optionSets');

// Subscriptions that ended (cancelled or expired) in the period, with how long they lasted and what the school paid in total.
module.exports = {
  key: 'renewals.churn',
  area: 'renewals',
  title: 'Churn',
  description: 'Subscriptions that ended in the period: lifetime and everything the school paid (without GST), minus refunds.',
  usesDateRange: true,

  filters: [
    {
      key: 'status',
      label: 'Outcome',
      type: 'select',
      options: [
        { value: 4, label: 'Cancelled' },
        { value: 5, label: 'Expired' },
      ],
    },
    { key: 'plan', label: 'Plan', type: 'select', options: 'plans' },
    { key: 'source', label: 'Source', type: 'select', options: 'billingSource' },
    { key: 'school', label: 'School', type: 'text' },
  ],

  columns: [
    { key: 'endedAt', label: 'Ended', type: 'datetime', width: 18 },
    { key: 'school', label: 'School', type: 'text', width: 30 },
    { key: 'planName', label: 'Plan', type: 'text', width: 20 },
    { key: 'status', label: 'Outcome', type: 'text', width: 12 },
    { key: 'source', label: 'Source', type: 'text', width: 16 },
    { key: 'startedAt', label: 'Started', type: 'datetime', width: 18 },
    { key: 'lifetimeDays', label: 'Lasted (days)', type: 'integer', width: 14 },
    { key: 'paymentsCount', label: 'Payments', type: 'integer', width: 11 },
    { key: 'paidExGstPaise', label: 'Paid (without GST)', type: 'money', width: 18 },
    { key: 'refundedPaise', label: 'Refunded', type: 'money', width: 14 },
    { key: 'contactEmail', label: 'Contact email', type: 'text', width: 28 },
  ],

  async run({ range, filters, page, perPage }) {
    const endedAt = 'COALESCE(s.ended_at, s.cancelled_at, s.updated_at)';
    const where = ['s.deleted_at IS NULL', `${endedAt} >= :from`, `${endedAt} <= :to`];
    const replacements = { from: range.fromDate, to: range.toDate };
    if (filters.status !== undefined) {
      where.push('s.status = :status');
      replacements.status = filters.status;
    } else {
      where.push('s.status IN (4, 5)');
    }
    await applyCommonFilters(filters, where, replacements);

    const from = `FROM subscriptions s
                  JOIN clients c ON c.id = s.client_id
                  JOIN plans p ON p.id = s.plan_id
                  LEFT JOIN LATERAL (
                    SELECT COUNT(*)::int AS payments_count,
                           COALESCE(SUM(COALESCE(inv.subtotal_paise, pay.amount_paise)), 0) AS paid_ex_gst,
                           COALESCE(SUM(pay.refunded_paise), 0) AS refunded
                      FROM payments pay
                      LEFT JOIN LATERAL (SELECT i.subtotal_paise FROM invoices i WHERE i.payment_id = pay.id AND i.status <> 4 ORDER BY i.id DESC LIMIT 1) inv ON TRUE
                     WHERE pay.subscription_id = s.id AND pay.status IN (3, 5, 6)
                  ) tot ON TRUE
                 WHERE ${where.join(' AND ')}`;

    const sql = `SELECT ${endedAt} AS "endedAt", c.name AS school, p.name AS "planName", s.status, s.source, s.started_at AS "startedAt",
                        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${endedAt} - COALESCE(s.started_at, s.created_at))) / 86400))::int AS "lifetimeDays",
                        tot.payments_count AS "paymentsCount", tot.paid_ex_gst AS "paidExGstPaise", tot.refunded AS "refundedPaise", c.contact_email AS "contactEmail"
                  ${from}
                  ORDER BY ${endedAt} DESC, s.id DESC`;
    const totalsSql = `SELECT COALESCE(SUM(tot.paid_ex_gst), 0)::float8 AS "paidExGstPaise", COALESCE(SUM(tot.refunded), 0)::float8 AS "refundedPaise" ${from}`;

    const result = await paged({ sql, replacements, page, perPage, totalsSql });

    return {
      rows: toNumbers(result.rows, ['paidExGstPaise', 'refundedPaise']).map((row) => ({
        ...row,
        status: optionSets.label('subscriptionStatus', row.status),
        source: optionSets.label('billingSource', row.source),
      })),
      total: result.total,
      totals: oneRowToNumbers(result.totals, ['paidExGstPaise', 'refundedPaise']),
    };
  },
};
