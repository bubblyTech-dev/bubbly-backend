const { like, paged, toNumbers, oneRowToNumbers } = require('../lib/sql');
const optionSets = require('../optionSets');

// Every invoice in the period. Totals leave out Void invoices.
module.exports = {
  key: 'gst.invoice_register',
  area: 'gst-invoices',
  title: 'Invoice register',
  description: 'Every invoice issued in the period with its taxable value, GST and total. Totals do not count Void invoices.',
  usesDateRange: true,

  filters: [
    { key: 'status', label: 'Status', type: 'select', options: 'invoiceStatus' },
    { key: 'source', label: 'Source', type: 'select', options: 'billingSource' },
    { key: 'search', label: 'School or invoice number', type: 'text' },
  ],

  columns: [
    { key: 'invoiceNo', label: 'Invoice no.', type: 'text', width: 18 },
    { key: 'issuedAt', label: 'Issued', type: 'datetime', width: 18 },
    { key: 'school', label: 'School', type: 'text', width: 30 },
    { key: 'buyerGst', label: 'School GST number', type: 'text', width: 20 },
    { key: 'status', label: 'Status', type: 'text', width: 10 },
    { key: 'periodStart', label: 'Period from', type: 'date', width: 13 },
    { key: 'periodEnd', label: 'Period to', type: 'date', width: 13 },
    { key: 'taxablePaise', label: 'Taxable value', type: 'money', width: 16 },
    { key: 'taxRatePercent', label: 'GST rate', type: 'percent', width: 10 },
    { key: 'gstPaise', label: 'GST', type: 'money', width: 14 },
    { key: 'totalPaise', label: 'Total', type: 'money', width: 16 },
    { key: 'source', label: 'Source', type: 'text', width: 16 },
    { key: 'paymentReference', label: 'Payment reference', type: 'text', width: 28 },
  ],

  async run({ range, filters, page, perPage }) {
    const issuedAt = 'COALESCE(i.issued_at, i.created_at)';
    const where = [`${issuedAt} >= :from`, `${issuedAt} <= :to`];
    const replacements = { from: range.fromDate, to: range.toDate };
    if (filters.status !== undefined) {
      where.push('i.status = :status');
      replacements.status = filters.status;
    }
    if (filters.source !== undefined) {
      where.push('pay.source = :source');
      replacements.source = filters.source;
    }
    if (filters.search) {
      where.push('(COALESCE(i.buyer_name, c.name) ILIKE :q OR c.name ILIKE :q OR i.invoice_no ILIKE :q)');
      replacements.q = like(filters.search);
    }

    const from = `FROM invoices i
                  JOIN clients c ON c.id = i.client_id
                  LEFT JOIN payments pay ON pay.id = i.payment_id
                 WHERE ${where.join(' AND ')}`;

    const sql = `SELECT COALESCE(i.invoice_no, '') AS "invoiceNo", ${issuedAt} AS "issuedAt", COALESCE(i.buyer_name, c.name) AS school,
                        COALESCE(i.gst_number, '') AS "buyerGst", i.status,
                        to_char((i.period_start AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS "periodStart",
                        to_char((i.period_end AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS "periodEnd",
                        i.subtotal_paise AS "taxablePaise", i.tax_rate_percent::float8 AS "taxRatePercent", i.tax_paise AS "gstPaise",
                        i.total_paise AS "totalPaise", pay.source, COALESCE(pay.razorpay_payment_id, pay.reference, '') AS "paymentReference"
                  ${from}
                  ORDER BY ${issuedAt} DESC, i.id DESC`;
    const totalsSql = `SELECT COALESCE(SUM(i.subtotal_paise) FILTER (WHERE i.status <> 4), 0)::float8 AS "taxablePaise",
                              COALESCE(SUM(i.tax_paise) FILTER (WHERE i.status <> 4), 0)::float8 AS "gstPaise",
                              COALESCE(SUM(i.total_paise) FILTER (WHERE i.status <> 4), 0)::float8 AS "totalPaise"
                         ${from}`;

    const result = await paged({ sql, replacements, page, perPage, totalsSql });

    return {
      rows: toNumbers(result.rows, ['taxablePaise', 'gstPaise', 'totalPaise']).map((row) => ({
        ...row,
        status: optionSets.label('invoiceStatus', row.status),
        source: row.source ? optionSets.label('billingSource', row.source) : '',
      })),
      total: result.total,
      totals: oneRowToNumbers(result.totals, ['taxablePaise', 'gstPaise', 'totalPaise']),
    };
  },
};
