const { bucketLabels, bucketSql, fillBuckets, kpi } = require('../series');
const { select, gstRatePercent, monthlyExGst, startedAtSql, endedAtSql, alignPrevious, previousRange } = require('../helpers/billingSql');

// ANALYTICS: Revenue (area "revenue"). All money is in paise, and revenue is WITHOUT GST.
//
// What it answers: how much came in, how much of that was GST, how it splits by plan and payment method,
// how the monthly recurring revenue (MRR) is moving, and who pays the most.
//
// Filters honoured
//   plan    the plan of the subscription the invoice belongs to
//   source  Online (Razorpay) or Offline, taken from the payment behind the invoice
//
// Rules used on this page (the same rules are used for every number)
//   - Revenue = the subtotal (price before GST) of PAID invoices, dated by the invoice issue date.
//   - GST collected = the tax amount of the same invoices. Revenue + GST = what the schools paid.
//   - Refunds = the refunded amount of payments, as the school received it (it includes GST), dated by the last update
//     of the payment. This is an estimate of WHEN the refund happened, the amount itself is exact. Refunds are shown on
//     their own and are NOT subtracted from revenue.
//   - Paying schools = schools with at least one paid invoice in the period. Average revenue per school = revenue / paying schools.
//   - MRR (monthly recurring revenue, an estimate): the monthly price WITHOUT GST of every plan whose subscription has
//     started and not ended (monthly price, quarterly / 3, yearly / 12). Past due and suspended ones still count until they
//     are cancelled or expire. The price of the PLAN is used, not what happened to be charged.
//     MRR trend = the same rule evaluated at the last moment of each period. ARR = MRR x 12.

// the optional filters for queries over invoices (alias i = invoice, p = its payment, s = its subscription)
const invoiceFilterSql = (filters) => {
  let sql = '';
  const replacements = {};

  if (filters.plan) {
    sql += ' AND s.plan_id IN (:planIds)';
    replacements.planIds = filters.plan.ids;
  }
  if (filters.source) {
    sql += ' AND COALESCE(p.source, 1) IN (:sources)';
    replacements.sources = filters.source;
  }

  return { sql, replacements };
};

// the same filters for queries over payments (alias p = payment, s = its subscription)
const paymentFilterSql = (filters) => {
  let sql = '';
  const replacements = {};

  if (filters.plan) {
    sql += ' AND s.plan_id IN (:planIds)';
    replacements.planIds = filters.plan.ids;
  }
  if (filters.source) {
    sql += ' AND p.source IN (:sources)';
    replacements.sources = filters.source;
  }

  return { sql, replacements };
};

// every invoice query starts from the same list: paid invoices of existing schools, with their plan and payment
const withInvoices = (extraSql, body) => `
  WITH inv AS (
    SELECT i.id, i.client_id, i.subtotal_paise, i.tax_paise, COALESCE(i.issued_at, i.created_at) AS event_at,
           COALESCE(p.source, 1) AS pay_source, p.method AS pay_method,
           s.plan_id, pl.name AS plan_name, c.name AS school_name
      FROM invoices i
      JOIN clients c ON c.id = i.client_id AND c.deleted_at IS NULL
      LEFT JOIN payments p ON p.id = i.payment_id
      LEFT JOIN subscriptions s ON s.id = i.subscription_id
      LEFT JOIN plans pl ON pl.id = s.plan_id
     WHERE i.status = 3${extraSql}
  )
  ${body}`;

const sums = async (from, to, extra) => {
  const [row] = await select(
    withInvoices(
      extra.sql,
      `SELECT COALESCE(SUM(v.subtotal_paise), 0)::bigint AS revenue, COALESCE(SUM(v.tax_paise), 0)::bigint AS gst, COUNT(DISTINCT v.client_id)::int AS schools
         FROM inv v WHERE v.event_at >= :from AND v.event_at <= :to`,
    ),
    { from, to, ...extra.replacements },
  );
  return { revenue: Number(row.revenue), gst: Number(row.gst), schools: row.schools };
};

const refundTotal = async (from, to, extra) => {
  const [row] = await select(
    `SELECT COALESCE(SUM(p.refunded_paise), 0)::bigint AS value
       FROM payments p
       JOIN clients c ON c.id = p.client_id AND c.deleted_at IS NULL
       LEFT JOIN subscriptions s ON s.id = p.subscription_id
      WHERE p.refunded_paise > 0 AND p.updated_at >= :from AND p.updated_at <= :to${extra.sql}`,
    { from, to, ...extra.replacements },
  );
  return Number(row.value);
};

// MRR at a list of moments; returns one number per moment (in the same order)
const mrrAt = async (moments, filters, gstRate) => {
  const subFilter = [];
  const replacements = { gstRate, moments: JSON.stringify(moments.map((moment) => moment.toISOString())) };
  if (filters.plan) {
    subFilter.push('s.plan_id IN (:planIds)');
    replacements.planIds = filters.plan.ids;
  }
  if (filters.source) {
    subFilter.push('s.source IN (:sources)');
    replacements.sources = filters.source;
  }

  const rows = await select(
    `WITH moments AS (
       SELECT t.moment::timestamptz AS moment, t.n::int AS n FROM jsonb_array_elements_text(CAST(:moments AS jsonb)) WITH ORDINALITY AS t(moment, n)
     ), running AS (
       SELECT ${startedAtSql('s')} AS start_at, ${endedAtSql('s')} AS end_at, ${monthlyExGst('p', 's')} AS monthly
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
         JOIN clients c ON c.id = s.client_id AND c.deleted_at IS NULL
        WHERE s.deleted_at IS NULL AND s.status <> 1${subFilter.map((piece) => ` AND ${piece}`).join('')}
     )
     SELECT m.n AS n, COALESCE(SUM(r.monthly), 0)::bigint AS value
       FROM moments m
       LEFT JOIN running r ON r.start_at <= m.moment AND (r.end_at IS NULL OR r.end_at > m.moment)
      GROUP BY m.n
      ORDER BY m.n`,
    replacements,
  );

  const byIndex = new Map(rows.map((row) => [Number(row.n), Number(row.value)]));
  return moments.map((_, index) => byIndex.get(index + 1) ?? 0);
};

// the last moment of a day in India time, as a Date
const endOfDay = (isoDate) => new Date(`${isoDate}T23:59:59.999+05:30`);

module.exports = {
  key: 'revenue.overview',
  area: 'revenue',
  title: 'Revenue',
  description: 'What came in without GST, how it splits by plan and payment method, and how monthly recurring revenue is moving.',
  filters: ['plan', 'source'],
  sourceKind: 'payment',
  exportTable: 'topPayers',

  async run({ range, filters }) {
    const invoiceExtra = invoiceFilterSql(filters);
    const paymentExtra = paymentFilterSql(filters);
    const buckets = bucketLabels(range);
    const labels = buckets.map((bucket) => bucket.label);
    const gstRate = await gstRatePercent();

    // ---- revenue and GST per period, plus the previous period lined up with it ----
    const perBucketSql = (from, to, granularity) =>
      select(
        withInvoices(
          invoiceExtra.sql,
          `SELECT ${bucketSql(granularity, 'v.event_at')} AS bucket, COALESCE(SUM(v.subtotal_paise), 0)::bigint AS revenue, COALESCE(SUM(v.tax_paise), 0)::bigint AS gst
             FROM inv v WHERE v.event_at >= :from AND v.event_at <= :to GROUP BY 1`,
        ),
        { from, to, ...invoiceExtra.replacements },
      );

    const currentRows = await perBucketSql(range.fromDate, range.toDate, range.granularity);
    const revenueSeries = fillBuckets(currentRows, buckets, 'revenue');
    const gstSeries = fillBuckets(currentRows, buckets, 'gst');

    let previousRevenueSeries = null;
    if (range.previous) {
      const previousRows = await perBucketSql(range.previous.fromDate, range.previous.toDate, range.granularity);
      previousRevenueSeries = alignPrevious(previousRows.map((row) => ({ bucket: row.bucket, value: row.revenue })), range, buckets.length);
    }

    // ---- refunds per period ----
    const refundRows = await select(
      `SELECT ${bucketSql(range.granularity, 'p.updated_at')} AS bucket, COALESCE(SUM(p.refunded_paise), 0)::bigint AS value
         FROM payments p
         JOIN clients c ON c.id = p.client_id AND c.deleted_at IS NULL
         LEFT JOIN subscriptions s ON s.id = p.subscription_id
        WHERE p.refunded_paise > 0 AND p.updated_at >= :from AND p.updated_at <= :to${paymentExtra.sql}
        GROUP BY 1`,
      { from: range.fromDate, to: range.toDate, ...paymentExtra.replacements },
    );
    const refundSeries = fillBuckets(refundRows, buckets);

    // ---- totals for the cards (and the same for the previous period) ----
    const [now, refundsNow] = await Promise.all([sums(range.fromDate, range.toDate, invoiceExtra), refundTotal(range.fromDate, range.toDate, paymentExtra)]);
    let before = null;
    let refundsBefore = null;
    if (range.previous) {
      [before, refundsBefore] = await Promise.all([sums(range.previous.fromDate, range.previous.toDate, invoiceExtra), refundTotal(range.previous.fromDate, range.previous.toDate, paymentExtra)]);
    }
    const average = (revenue, schools) => (schools > 0 ? Math.round(revenue / schools) : 0);

    // ---- MRR: now, at the end of the previous period, and at the end of each period of the range ----
    const moments = [new Date(), ...buckets.map((bucket) => endOfDay(bucket.to))];
    const previousMoment = previousRange(range) ? [endOfDay(range.previous.to)] : [];
    const mrrValues = await mrrAt([...moments, ...previousMoment], filters, gstRate);
    const mrrNow = mrrValues[0];
    const mrrTrend = mrrValues.slice(1, 1 + buckets.length);
    const mrrBefore = previousMoment.length ? mrrValues[mrrValues.length - 1] : null;

    // ---- by plan, by payment method ----
    const byPlan = await select(
      withInvoices(invoiceExtra.sql, `SELECT COALESCE(v.plan_name, 'No plan') AS label, COALESCE(SUM(v.subtotal_paise), 0)::bigint AS value FROM inv v WHERE v.event_at >= :from AND v.event_at <= :to GROUP BY 1 ORDER BY value DESC, label LIMIT 12`),
      { from: range.fromDate, to: range.toDate, ...invoiceExtra.replacements },
    );
    const byMethod = await select(
      withInvoices(
        invoiceExtra.sql,
        `SELECT (CASE WHEN v.pay_source = 2 THEN 'Offline' ELSE COALESCE(INITCAP(NULLIF(TRIM(v.pay_method), '')), 'Other') END) AS label,
                COALESCE(SUM(v.subtotal_paise), 0)::bigint AS value
           FROM inv v WHERE v.event_at >= :from AND v.event_at <= :to GROUP BY 1 ORDER BY value DESC, label`,
      ),
      { from: range.fromDate, to: range.toDate, ...invoiceExtra.replacements },
    );

    // ---- who pays the most ----
    const topPayers = await select(
      withInvoices(
        invoiceExtra.sql,
        `SELECT v.school_name AS school, MAX(v.plan_name) AS "planName", COUNT(*)::int AS invoices,
                COALESCE(SUM(v.subtotal_paise), 0)::bigint AS "revenuePaise", COALESCE(SUM(v.tax_paise), 0)::bigint AS "gstPaise", MAX(v.event_at) AS "lastPaidAt"
           FROM inv v WHERE v.event_at >= :from AND v.event_at <= :to
          GROUP BY v.client_id, v.school_name
          ORDER BY "revenuePaise" DESC, v.school_name
          LIMIT 25`,
      ),
      { from: range.fromDate, to: range.toDate, ...invoiceExtra.replacements },
    );

    return {
      kpis: [
        kpi({ key: 'revenue', label: 'Revenue (without GST)', value: now.revenue, previous: before?.revenue, unit: 'money', sparkline: revenueSeries }),
        kpi({ key: 'gst', label: 'GST collected', value: now.gst, previous: before?.gst, unit: 'money', sparkline: gstSeries }),
        kpi({ key: 'refunds', label: 'Refunded', value: refundsNow, previous: refundsBefore, unit: 'money', sparkline: refundSeries }),
        kpi({ key: 'mrr', label: 'Monthly recurring revenue', value: mrrNow, previous: mrrBefore, unit: 'money', sparkline: mrrTrend }),
        kpi({ key: 'arr', label: 'Yearly recurring revenue', value: mrrNow * 12, previous: mrrBefore === null ? null : mrrBefore * 12, unit: 'money' }),
        kpi({ key: 'payingSchools', label: 'Paying schools', value: now.schools, previous: before?.schools }),
        kpi({ key: 'averageRevenue', label: 'Average revenue per school', value: average(now.revenue, now.schools), previous: before ? average(before.revenue, before.schools) : null, unit: 'money' }),
      ],
      series: {
        revenueTrend: {
          labels,
          datasets: [
            { key: 'revenue', label: 'Revenue', data: revenueSeries, unit: 'money' },
            ...(previousRevenueSeries ? [{ key: 'previous', label: 'Previous period', data: previousRevenueSeries, unit: 'money' }] : []),
          ],
        },
        mrrTrend: { labels, datasets: [{ key: 'mrr', label: 'Monthly recurring revenue', data: mrrTrend, unit: 'money' }] },
        gstSplit: {
          labels,
          datasets: [
            { key: 'revenue', label: 'Revenue', data: revenueSeries, unit: 'money' },
            { key: 'gst', label: 'GST', data: gstSeries, unit: 'money' },
          ],
        },
        refundsTrend: { labels, datasets: [{ key: 'refunds', label: 'Refunded', data: refundSeries, unit: 'money' }] },
        byPlan: { labels: byPlan.map((row) => row.label), datasets: [{ key: 'revenue', label: 'Revenue', data: byPlan.map((row) => Number(row.value)), unit: 'money' }] },
      },
      breakdowns: {
        byMethod: byMethod.map((row) => ({ label: row.label, value: Number(row.value) })),
      },
      tables: {
        topPayers: {
          columns: [
            { key: 'school', label: 'School', type: 'text' },
            { key: 'planName', label: 'Plan', type: 'text' },
            { key: 'invoices', label: 'Invoices', type: 'integer' },
            { key: 'revenuePaise', label: 'Revenue (no GST)', type: 'money' },
            { key: 'gstPaise', label: 'GST', type: 'money' },
            { key: 'lastPaidAt', label: 'Last paid', type: 'date' },
          ],
          rows: topPayers.map((row) => ({ ...row, revenuePaise: Number(row.revenuePaise), gstPaise: Number(row.gstPaise) })),
        },
      },
    };
  },
};
