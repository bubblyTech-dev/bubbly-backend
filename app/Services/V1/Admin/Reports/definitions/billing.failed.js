const { paged, toNumbers, oneRowToNumbers, applyCommonFilters, paymentFromSql, PAID_AT } = require('../lib/sql');
const optionSets = require('../optionSets');

// Payments that failed in the period, with the reason Razorpay gave and where the school's subscription stands now.
module.exports = {
  key: 'billing.failed',
  area: 'billing',
  title: 'Failed payments',
  description: 'Payments that failed in the period, with the reason and the school\'s current subscription status.',
  usesDateRange: true,

  filters: [
    { key: 'plan', label: 'Plan', type: 'select', options: 'plans' },
    { key: 'source', label: 'Source', type: 'select', options: 'billingSource' },
    { key: 'school', label: 'School', type: 'text' },
  ],

  columns: [
    { key: 'failedAt', label: 'Date', type: 'datetime', width: 18 },
    { key: 'school', label: 'School', type: 'text', width: 30 },
    { key: 'planName', label: 'Plan', type: 'text', width: 20 },
    { key: 'method', label: 'Method', type: 'text', width: 14 },
    { key: 'amountPaise', label: 'Amount', type: 'money', width: 14 },
    { key: 'failureCode', label: 'Failure code', type: 'text', width: 22 },
    { key: 'failureReason', label: 'Reason', type: 'text', width: 44 },
    { key: 'subscriptionStatus', label: 'Subscription now', type: 'text', width: 16 },
    { key: 'reference', label: 'Reference', type: 'text', width: 28 },
  ],

  async run({ range, filters, page, perPage }) {
    const where = ['p.status = 4', `${PAID_AT} >= :from`, `${PAID_AT} <= :to`];
    const replacements = { from: range.fromDate, to: range.toDate };
    await applyCommonFilters(filters, where, replacements, { plan: 's', source: 'p', client: 'c' });

    const from = `${paymentFromSql()} WHERE ${where.join(' AND ')}`;

    const sql = `SELECT ${PAID_AT} AS "failedAt", c.name AS school, pl.name AS "planName", COALESCE(p.method, '') AS method,
                        p.amount_paise AS "amountPaise", COALESCE(p.failure_code, '') AS "failureCode", COALESCE(p.failure_reason, '') AS "failureReason",
                        s.status AS "subscriptionStatus", COALESCE(p.razorpay_payment_id, p.reference, '') AS reference
                   ${from}
                  ORDER BY ${PAID_AT} DESC, p.id DESC`;
    const totalsSql = `SELECT COALESCE(SUM(p.amount_paise), 0)::float8 AS "amountPaise" ${from}`;

    const result = await paged({ sql, replacements, page, perPage, totalsSql });

    return {
      rows: toNumbers(result.rows, ['amountPaise']).map((row) => ({
        ...row,
        planName: row.planName || '',
        subscriptionStatus: row.subscriptionStatus ? optionSets.label('subscriptionStatus', row.subscriptionStatus) : '',
      })),
      total: result.total,
      totals: oneRowToNumbers(result.totals, ['amountPaise']),
    };
  },
};
