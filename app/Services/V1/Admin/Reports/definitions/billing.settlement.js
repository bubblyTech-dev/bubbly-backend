const { paged, toNumbers, oneRowToNumbers, applyCommonFilters, paymentFromSql, PAID_AT } = require('../lib/sql');

// A day-by-day check of the online (Razorpay) payments against our own records.
//
// IMPORTANT: this report does NOT fetch the real settlements from Razorpay. It compares what our database says about each day's
// online payments (amount, Razorpay fee and the fee's tax, refunds, and the invoice we issued) and flags days that look wrong.
// Compare the "Expected settlement" column with the settlement report in the Razorpay dashboard to reconcile the bank account.
//
// A day gets a flag when: a captured payment has no invoice, a payment amount differs from its invoice total,
// a payment is still only Authorized after 2 days (never captured), or a captured payment has no fee recorded.
module.exports = {
  key: 'billing.settlement',
  area: 'billing',
  title: 'Razorpay settlement check',
  description: 'Online payments per day against our records: fees, refunds, expected settlement and anything that looks wrong. Live settlements are not fetched from Razorpay.',
  usesDateRange: true,

  filters: [{ key: 'plan', label: 'Plan', type: 'select', options: 'plans' }],

  columns: [
    { key: 'day', label: 'Date', type: 'date', width: 14 },
    { key: 'payments', label: 'Payments', type: 'integer', width: 11 },
    { key: 'grossPaise', label: 'Collected', type: 'money', width: 16 },
    { key: 'feePaise', label: 'Razorpay fee', type: 'money', width: 14 },
    { key: 'feeTaxPaise', label: 'Tax on fee', type: 'money', width: 14 },
    { key: 'refundsPaise', label: 'Refunds', type: 'money', width: 14 },
    { key: 'expectedPaise', label: 'Expected settlement', type: 'money', width: 18 },
    { key: 'invoicedPaise', label: 'Invoiced', type: 'money', width: 14 },
    { key: 'differencePaise', label: 'Difference', type: 'money', width: 14 },
    { key: 'check', label: 'Check', type: 'text', width: 44 },
  ],

  async run({ range, filters, page, perPage }) {
    const where = ['p.source = 1', 'p.status IN (2, 3, 5, 6)', `${PAID_AT} >= :from`, `${PAID_AT} <= :to`];
    const replacements = { from: range.fromDate, to: range.toDate };
    await applyCommonFilters(filters, where, replacements, { plan: 's', source: 'p', client: 'c' });

    const paid = 'p.status IN (3, 5, 6)';
    const sql = `SELECT to_char((${PAID_AT} AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day,
                        (COUNT(*) FILTER (WHERE ${paid}))::int AS payments,
                        COALESCE(SUM(p.amount_paise) FILTER (WHERE ${paid}), 0)::float8 AS "grossPaise",
                        COALESCE(SUM(p.fee_paise) FILTER (WHERE ${paid}), 0)::float8 AS "feePaise",
                        COALESCE(SUM(p.tax_paise) FILTER (WHERE ${paid}), 0)::float8 AS "feeTaxPaise",
                        COALESCE(SUM(p.refunded_paise) FILTER (WHERE ${paid}), 0)::float8 AS "refundsPaise",
                        COALESCE(SUM(inv.total_paise) FILTER (WHERE ${paid}), 0)::float8 AS "invoicedPaise",
                        COALESCE(SUM(ABS(p.amount_paise - inv.total_paise)) FILTER (WHERE ${paid} AND inv.id IS NOT NULL), 0)::float8 AS "mismatchPaise",
                        (COUNT(*) FILTER (WHERE ${paid} AND inv.id IS NULL))::int AS "withoutInvoice",
                        (COUNT(*) FILTER (WHERE p.status = 2 AND ${PAID_AT} < NOW() - INTERVAL '2 days'))::int AS "notCaptured",
                        (COUNT(*) FILTER (WHERE ${paid} AND p.fee_paise IS NULL))::int AS "withoutFee"
                   ${paymentFromSql()}
                  WHERE ${where.join(' AND ')}
                  GROUP BY 1
                  ORDER BY 1 DESC`;

    const totalsSql = `SELECT COALESCE(SUM(t.payments), 0)::int AS payments, COALESCE(SUM(t."grossPaise"), 0)::float8 AS "grossPaise",
                              COALESCE(SUM(t."feePaise"), 0)::float8 AS "feePaise", COALESCE(SUM(t."feeTaxPaise"), 0)::float8 AS "feeTaxPaise",
                              COALESCE(SUM(t."refundsPaise"), 0)::float8 AS "refundsPaise", COALESCE(SUM(t."invoicedPaise"), 0)::float8 AS "invoicedPaise"
                         FROM (${sql}) t`;

    const result = await paged({ sql, replacements, page, perPage, totalsSql });

    const keys = ['grossPaise', 'feePaise', 'feeTaxPaise', 'refundsPaise', 'invoicedPaise', 'mismatchPaise'];
    const rows = toNumbers(result.rows, keys).map((row) => {
      const flags = [];
      if (row.withoutInvoice > 0) flags.push(`${row.withoutInvoice} payment(s) without an invoice`);
      if (row.mismatchPaise > 0) flags.push(`amount differs from invoice by Rs. ${(row.mismatchPaise / 100).toFixed(2)}`);
      if (row.notCaptured > 0) flags.push(`${row.notCaptured} authorized but not captured`);
      if (row.withoutFee > 0) flags.push(`${row.withoutFee} without a fee recorded`);

      const { mismatchPaise, withoutInvoice, notCaptured, withoutFee, ...clean } = row;
      return {
        ...clean,
        expectedPaise: row.grossPaise - row.feePaise - row.feeTaxPaise - row.refundsPaise,
        differencePaise: row.grossPaise - row.invoicedPaise,
        check: flags.length ? `Check: ${flags.join('; ')}` : 'OK',
      };
    });

    const totals = oneRowToNumbers(result.totals, ['grossPaise', 'feePaise', 'feeTaxPaise', 'refundsPaise', 'invoicedPaise']);
    totals.expectedPaise = totals.grossPaise - totals.feePaise - totals.feeTaxPaise - totals.refundsPaise;
    totals.differencePaise = totals.grossPaise - totals.invoicedPaise;

    return { rows, total: result.total, totals };
  },
};
