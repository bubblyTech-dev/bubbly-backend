const { like, paged, toNumbers, oneRowToNumbers, applyCommonFilters, paymentFromSql, PAID_AT, TAXABLE, GST } = require('../lib/sql');

// Payments staff recorded by hand (cash, bank transfer, cheque, UPI), with the valid-until date they chose.
module.exports = {
  key: 'billing.offline',
  area: 'billing',
  title: 'Offline payments',
  description: 'Payments recorded by staff: method, reference, who recorded them and until when the school is valid.',
  usesDateRange: true,

  filters: [
    { key: 'method', label: 'Method', type: 'text' },
    { key: 'plan', label: 'Plan', type: 'select', options: 'plans' },
    { key: 'school', label: 'School', type: 'text' },
  ],

  columns: [
    { key: 'paidAt', label: 'Paid on', type: 'datetime', width: 18 },
    { key: 'school', label: 'School', type: 'text', width: 30 },
    { key: 'planName', label: 'Plan', type: 'text', width: 20 },
    { key: 'method', label: 'Method', type: 'text', width: 16 },
    { key: 'reference', label: 'Reference', type: 'text', width: 24 },
    { key: 'taxablePaise', label: 'Taxable value', type: 'money', width: 16 },
    { key: 'gstPaise', label: 'GST', type: 'money', width: 14 },
    { key: 'amountPaise', label: 'Amount paid', type: 'money', width: 16 },
    { key: 'validUntil', label: 'Valid until', type: 'datetime', width: 18 },
    { key: 'recordedBy', label: 'Recorded by', type: 'text', width: 22 },
    { key: 'invoiceNo', label: 'Invoice', type: 'text', width: 18 },
    { key: 'notes', label: 'Notes', type: 'text', width: 34 },
  ],

  async run({ range, filters, page, perPage }) {
    const where = ['p.source = 2', `${PAID_AT} >= :from`, `${PAID_AT} <= :to`];
    const replacements = { from: range.fromDate, to: range.toDate };
    if (filters.method) {
      where.push('p.method ILIKE :method');
      replacements.method = like(filters.method);
    }
    await applyCommonFilters(filters, where, replacements, { plan: 's', source: 'p', client: 'c' });

    const from = `${paymentFromSql()}
      LEFT JOIN admin_users a ON a.id = p.recorded_by
      WHERE ${where.join(' AND ')}`;

    const sql = `SELECT ${PAID_AT} AS "paidAt", c.name AS school, pl.name AS "planName", COALESCE(p.method, '') AS method,
                        COALESCE(p.reference, '') AS reference, ${TAXABLE} AS "taxablePaise", ${GST} AS "gstPaise", p.amount_paise AS "amountPaise",
                        s.current_period_end AS "validUntil", COALESCE(a.name, a.email, '') AS "recordedBy", inv.invoice_no AS "invoiceNo",
                        COALESCE(p.notes, '') AS notes
                   ${from}
                  ORDER BY ${PAID_AT} DESC, p.id DESC`;
    const totalsSql = `SELECT COALESCE(SUM(${TAXABLE}), 0)::float8 AS "taxablePaise", COALESCE(SUM(${GST}), 0)::float8 AS "gstPaise",
                              COALESCE(SUM(p.amount_paise) FILTER (WHERE p.status IN (3, 5, 6)), 0)::float8 AS "amountPaise"
                         ${from}`;

    const result = await paged({ sql, replacements, page, perPage, totalsSql });

    return {
      rows: toNumbers(result.rows, ['taxablePaise', 'gstPaise', 'amountPaise']).map((row) => ({
        ...row,
        planName: row.planName || '',
        invoiceNo: row.invoiceNo || '',
      })),
      total: result.total,
      totals: oneRowToNumbers(result.totals, ['taxablePaise', 'gstPaise', 'amountPaise']),
    };
  },
};
