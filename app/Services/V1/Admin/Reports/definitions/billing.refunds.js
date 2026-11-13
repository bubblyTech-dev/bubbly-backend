const { paged, toNumbers, oneRowToNumbers, applyCommonFilters, paymentFromSql, refundEventSql, PAID_AT } = require('../lib/sql');
const optionSets = require('../optionSets');

// Payments that were refunded (fully or partly). The refund date is the day of the latest refund event in the audit log;
// a payment refunded only through the Razorpay dashboard uses the day it was last updated.
module.exports = {
  key: 'billing.refunds',
  area: 'billing',
  title: 'Refunds register',
  description: 'Every refunded payment in the period with the amount refunded, the reason and who did it.',
  usesDateRange: true,

  filters: [
    {
      key: 'status',
      label: 'Refund type',
      type: 'select',
      options: [
        { value: 5, label: 'Fully refunded' },
        { value: 6, label: 'Partly refunded' },
      ],
    },
    { key: 'plan', label: 'Plan', type: 'select', options: 'plans' },
    { key: 'source', label: 'Source', type: 'select', options: 'billingSource' },
    { key: 'school', label: 'School', type: 'text' },
  ],

  columns: [
    { key: 'refundedAt', label: 'Refunded on', type: 'datetime', width: 18 },
    { key: 'school', label: 'School', type: 'text', width: 30 },
    { key: 'planName', label: 'Plan', type: 'text', width: 20 },
    { key: 'invoiceNo', label: 'Invoice', type: 'text', width: 18 },
    { key: 'paidAt', label: 'Paid on', type: 'datetime', width: 18 },
    { key: 'paymentPaise', label: 'Payment', type: 'money', width: 14 },
    { key: 'refundedPaise', label: 'Refunded', type: 'money', width: 14 },
    { key: 'status', label: 'Refund type', type: 'text', width: 16 },
    { key: 'source', label: 'Source', type: 'text', width: 16 },
    { key: 'reason', label: 'Reason', type: 'text', width: 30 },
    { key: 'reference', label: 'Reference', type: 'text', width: 28 },
  ],

  async run({ range, filters, page, perPage }) {
    const refundedAt = 'COALESCE(r.created_at, p.updated_at)';
    const where = ['p.refunded_paise > 0', `${refundedAt} >= :from`, `${refundedAt} <= :to`];
    const replacements = { from: range.fromDate, to: range.toDate };
    if (filters.status !== undefined) {
      where.push('p.status = :status');
      replacements.status = filters.status;
    }
    await applyCommonFilters(filters, where, replacements, { plan: 's', source: 'p', client: 'c' });

    const from = `${paymentFromSql()}
      ${refundEventSql('r', 'p')}
      WHERE ${where.join(' AND ')}`;

    const sql = `SELECT ${refundedAt} AS "refundedAt", c.name AS school, pl.name AS "planName", inv.invoice_no AS "invoiceNo",
                        ${PAID_AT} AS "paidAt", p.amount_paise AS "paymentPaise", p.refunded_paise AS "refundedPaise", p.status, p.source,
                        COALESCE(r.after_data ->> 'reason', '') AS reason, COALESCE(p.razorpay_payment_id, p.reference, '') AS reference
                   ${from}
                  ORDER BY ${refundedAt} DESC, p.id DESC`;
    const totalsSql = `SELECT COALESCE(SUM(p.amount_paise), 0)::float8 AS "paymentPaise", COALESCE(SUM(p.refunded_paise), 0)::float8 AS "refundedPaise" ${from}`;

    const result = await paged({ sql, replacements, page, perPage, totalsSql });

    return {
      rows: toNumbers(result.rows, ['paymentPaise', 'refundedPaise']).map((row) => ({
        ...row,
        planName: row.planName || '',
        invoiceNo: row.invoiceNo || '',
        status: Number(row.status) === 5 ? 'Fully refunded' : 'Partly refunded',
        source: optionSets.label('billingSource', row.source),
      })),
      total: result.total,
      totals: oneRowToNumbers(result.totals, ['paymentPaise', 'refundedPaise']),
    };
  },
};
