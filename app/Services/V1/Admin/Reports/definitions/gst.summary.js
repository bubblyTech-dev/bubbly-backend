const Settings = require('@app/Helpers/settings');
const { fiscalYearLabel } = require('@app/Helpers/dateRange');
const { paged, toNumbers, oneRowToNumbers } = require('../lib/sql');

// GST summary for return filing: taxable value, GST and total of the invoices issued in the period, by month or by financial year
// (the financial year follows Settings > Reports & analytics, April to March by default), and by GST rate.
// Draft and Void invoices are left out. Only the total GST is stored on an invoice, so there is no CGST / SGST / IGST split here.
module.exports = {
  key: 'gst.summary',
  area: 'gst-invoices',
  title: 'GST summary',
  description: 'Taxable value and GST of the invoices issued in the period, by month or by financial year and GST rate. Void invoices are left out.',
  usesDateRange: true,

  filters: [
    {
      key: 'groupBy',
      label: 'Group by',
      type: 'select',
      options: [
        { value: 'month', label: 'Month' },
        { value: 'fy', label: 'Financial year' },
      ],
    },
  ],

  columns: [
    { key: 'period', label: 'Period', type: 'text', width: 16 },
    { key: 'taxRatePercent', label: 'GST rate', type: 'percent', width: 10 },
    { key: 'invoices', label: 'Invoices', type: 'integer', width: 10 },
    { key: 'taxablePaise', label: 'Taxable value', type: 'money', width: 18 },
    { key: 'gstPaise', label: 'GST', type: 'money', width: 16 },
    { key: 'totalPaise', label: 'Total', type: 'money', width: 18 },
  ],

  async run({ range, filters, page, perPage }) {
    const startMonth = Math.min(12, Math.max(1, Number(await Settings.get('reports.fiscal_year_start_month')) || 4));
    const byFy = filters.groupBy === 'fy';
    const issued = "(COALESCE(i.issued_at, i.created_at) AT TIME ZONE 'Asia/Kolkata')";
    const replacements = { from: range.fromDate, to: range.toDate, startMonth };

    // the group: the first day of the month, or the year the financial year starts in
    const group = byFy
      ? `(EXTRACT(YEAR FROM ${issued})::int - CASE WHEN EXTRACT(MONTH FROM ${issued})::int >= :startMonth THEN 0 ELSE 1 END)`
      : `to_char(date_trunc('month', ${issued}), 'YYYY-MM-DD')`;

    const sql = `SELECT ${group} AS grp, i.tax_rate_percent::float8 AS "taxRatePercent", COUNT(*)::int AS invoices,
                        COALESCE(SUM(i.subtotal_paise), 0)::float8 AS "taxablePaise", COALESCE(SUM(i.tax_paise), 0)::float8 AS "gstPaise",
                        COALESCE(SUM(i.total_paise), 0)::float8 AS "totalPaise"
                   FROM invoices i
                  WHERE i.status IN (2, 3) AND COALESCE(i.issued_at, i.created_at) >= :from AND COALESCE(i.issued_at, i.created_at) <= :to
                  GROUP BY 1, 2
                  ORDER BY 1 DESC, 2 ASC`;
    const totalsSql = `SELECT COALESCE(SUM(t.invoices), 0)::int AS invoices, COALESCE(SUM(t."taxablePaise"), 0)::float8 AS "taxablePaise",
                              COALESCE(SUM(t."gstPaise"), 0)::float8 AS "gstPaise", COALESCE(SUM(t."totalPaise"), 0)::float8 AS "totalPaise"
                         FROM (${sql}) t`;

    const result = await paged({ sql, replacements, page, perPage, totalsSql });

    const rows = toNumbers(result.rows, ['taxablePaise', 'gstPaise', 'totalPaise']).map(({ grp, ...row }) => {
      let period;
      if (byFy) {
        period = fiscalYearLabel(`${grp}-${String(startMonth).padStart(2, '0')}-01`, startMonth);
      } else {
        const date = new Date(`${grp}T00:00:00Z`);
        period = date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
      }
      return { period, ...row };
    });

    return { rows, total: result.total, totals: oneRowToNumbers(result.totals, ['taxablePaise', 'gstPaise', 'totalPaise']) };
  },
};
