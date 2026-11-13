const { like, paged, toNumbers, oneRowToNumbers, applyCommonFilters, paymentFromSql, PAID_AT, TAXABLE, GST } = require('../lib/sql');
const optionSets = require('../optionSets');

// Every payment attempt in the period. Totals count money received only (captured, refunded and partly refunded payments).
module.exports = {
  key: 'billing.payments',
  area: 'billing',
  title: 'Payments register',
  description: 'Every payment in the period. Amounts are split into the taxable value and GST; totals count captured payments only.',
  usesDateRange: true,

  filters: [
    { key: 'status', label: 'Status', type: 'select', options: 'paymentStatus' },
    { key: 'source', label: 'Source', type: 'select', options: 'billingSource' },
    { key: 'method', label: 'Method', type: 'text' },
    { key: 'plan', label: 'Plan', type: 'select', options: 'plans' },
    { key: 'school', label: 'School', type: 'text' },
  ],

  columns: [
    { key: 'paidAt', label: 'Date', type: 'datetime', width: 18 },
    { key: 'school', label: 'School', type: 'text', width: 30 },
    { key: 'planName', label: 'Plan', type: 'text', width: 20 },
    { key: 'invoiceNo', label: 'Invoice', type: 'text', width: 18 },
    { key: 'status', label: 'Status', type: 'text', width: 16 },
    { key: 'source', label: 'Source', type: 'text', width: 16 },
    { key: 'method', label: 'Method', type: 'text', width: 14 },
    { key: 'taxablePaise', label: 'Taxable value', type: 'money', width: 16 },
    { key: 'gstPaise', label: 'GST', type: 'money', width: 14 },
    { key: 'amountPaise', label: 'Amount paid', type: 'money', width: 16 },
    { key: 'refundedPaise', label: 'Refunded', type: 'money', width: 14 },
    { key: 'reference', label: 'Reference', type: 'text', width: 28 },
  ],

  async run({ range, filters, page, perPage }) {
    const where = [`${PAID_AT} >= :from`, `${PAID_AT} <= :to`];
    const replacements = { from: range.fromDate, to: range.toDate };
    if (filters.status !== undefined) {
      where.push('p.status = :status');
      replacements.status = filters.status;
    }
    if (filters.method) {
      where.push('p.method ILIKE :method');
      replacements.method = like(filters.method);
    }
    await applyCommonFilters(filters, where, replacements, { plan: 's', source: 'p', client: 'c' });

    const from = `${paymentFromSql()} WHERE ${where.join(' AND ')}`;

    const sql = `SELECT ${PAID_AT} AS "paidAt", c.name AS school, pl.name AS "planName", inv.invoice_no AS "invoiceNo", p.status, p.source,
                        COALESCE(p.method, '') AS method, ${TAXABLE} AS "taxablePaise", ${GST} AS "gstPaise", p.amount_paise AS "amountPaise",
                        COALESCE(p.refunded_paise, 0) AS "refundedPaise", COALESCE(p.razorpay_payment_id, p.reference, '') AS reference
                   ${from}
                  ORDER BY ${PAID_AT} DESC, p.id DESC`;

    const totalsSql = `SELECT COALESCE(SUM(${TAXABLE}), 0)::float8 AS "taxablePaise", COALESCE(SUM(${GST}), 0)::float8 AS "gstPaise",
                              COALESCE(SUM(p.amount_paise) FILTER (WHERE p.status IN (3, 5, 6)), 0)::float8 AS "amountPaise",
                              COALESCE(SUM(p.refunded_paise), 0)::float8 AS "refundedPaise"
                         ${from}`;

    const result = await paged({ sql, replacements, page, perPage, totalsSql });

    return {
      rows: toNumbers(result.rows, ['taxablePaise', 'gstPaise', 'amountPaise', 'refundedPaise']).map((row) => ({
        ...row,
        invoiceNo: row.invoiceNo || '',
        planName: row.planName || '',
        status: optionSets.label('paymentStatus', row.status),
        source: optionSets.label('billingSource', row.source),
      })),
      total: result.total,
      totals: oneRowToNumbers(result.totals, ['taxablePaise', 'gstPaise', 'amountPaise', 'refundedPaise']),
    };
  },
};
