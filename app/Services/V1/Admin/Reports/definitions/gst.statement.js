const { like, paged, toNumbers, oneRowToNumbers, refundEventSql } = require('../lib/sql');

// A statement of account: invoices (what the school owes), payments (what it paid) and refunds, with a running balance per school.
// Balance = invoices - payments + refunds, so a positive balance is money still owed by the school. The balance includes everything
// before the chosen period, so the first line of a period starts from the right opening balance.
module.exports = {
  key: 'gst.statement',
  area: 'gst-invoices',
  title: 'Statement per school',
  description: 'Invoices, payments and refunds of a school with a running balance (positive = owed by the school). Search a school name for one statement.',
  usesDateRange: true,

  filters: [{ key: 'school', label: 'School', type: 'text' }],

  columns: [
    { key: 'at', label: 'Date', type: 'datetime', width: 18 },
    { key: 'school', label: 'School', type: 'text', width: 30 },
    { key: 'kind', label: 'Type', type: 'text', width: 10 },
    { key: 'reference', label: 'Reference', type: 'text', width: 28 },
    { key: 'description', label: 'Description', type: 'text', width: 32 },
    { key: 'debitPaise', label: 'Invoiced / refunded', type: 'money', width: 18 },
    { key: 'creditPaise', label: 'Paid', type: 'money', width: 16 },
    { key: 'balancePaise', label: 'Balance', type: 'money', width: 16 },
  ],

  async run({ range, filters, page, perPage }) {
    const replacements = { from: range.fromDate, to: range.toDate };
    let schoolWhere = '';
    if (filters.school) {
      schoolWhere = 'AND c.name ILIKE :school';
      replacements.school = like(filters.school);
    }

    // all lines of the matching schools, with the running balance over their whole history, then cut to the period
    const sql = `WITH lines AS (
                   SELECT i.client_id, COALESCE(i.issued_at, i.created_at) AS at, 1 AS ord, i.id AS rid, 'Invoice' AS kind,
                          COALESCE(i.invoice_no, '') AS reference, 'Invoice issued' AS description, i.total_paise AS debit, 0::bigint AS credit
                     FROM invoices i
                    WHERE i.status IN (2, 3)
                   UNION ALL
                   SELECT p.client_id, COALESCE(p.paid_at, p.created_at), 2, p.id, 'Payment',
                          COALESCE(p.razorpay_payment_id, p.reference, ''), 'Payment received' || COALESCE(' (' || NULLIF(p.method, '') || ')', ''),
                          0::bigint, p.amount_paise
                     FROM payments p
                    WHERE p.status IN (3, 5, 6)
                   UNION ALL
                   SELECT p.client_id, COALESCE(r.created_at, p.updated_at), 3, p.id, 'Refund',
                          COALESCE(p.razorpay_payment_id, p.reference, ''), COALESCE('Refund: ' || NULLIF(r.after_data ->> 'reason', ''), 'Refund'),
                          p.refunded_paise, 0::bigint
                     FROM payments p
                     ${refundEventSql('r', 'p')}
                    WHERE p.refunded_paise > 0
                 ), running AS (
                   SELECT l.at, c.name AS school, l.kind, l.reference, l.description, l.debit AS "debitPaise", l.credit AS "creditPaise",
                          SUM(l.debit - l.credit) OVER (PARTITION BY l.client_id ORDER BY l.at, l.ord, l.rid)::float8 AS "balancePaise",
                          l.ord, l.rid, l.client_id
                     FROM lines l
                     JOIN clients c ON c.id = l.client_id
                    WHERE TRUE ${schoolWhere}
                 )
                 SELECT at, school, kind, reference, description, "debitPaise", "creditPaise", "balancePaise"
                   FROM running
                  WHERE at >= :from AND at <= :to
                  ORDER BY school ASC, client_id ASC, at ASC, ord ASC, rid ASC`;

    const totalsSql = `SELECT COALESCE(SUM(t."debitPaise"), 0)::float8 AS "debitPaise", COALESCE(SUM(t."creditPaise"), 0)::float8 AS "creditPaise"
                         FROM (${sql}) t`;

    const result = await paged({ sql, replacements, page, perPage, totalsSql });

    return {
      rows: toNumbers(result.rows, ['debitPaise', 'creditPaise', 'balancePaise']),
      total: result.total,
      totals: oneRowToNumbers(result.totals, ['debitPaise', 'creditPaise']),
    };
  },
};
