const optionSets = require('../../Reports/optionSets');
const { bucketLabels, bucketSql, fillBuckets, kpi } = require('../series');
const { select, gstRatePercent, monthlyExGst, periodPriceExGst, startedAtSql, roundOne } = require('../helpers/billingSql');

// ANALYTICS: Schools (area "schools").
//
// What it answers: how many schools joined, how the base grew, which plan and place they come from,
// how many sign-ups end up paying, and who the biggest schools are.
//
// Filters honoured
//   plan    schools that have (or had) a subscription on the selected plan(s)
//   status  the school's current status (Active, Suspended, Archived)
//
// Rules used on this page
//   - "Total schools" counts schools created up to the end of the range (archived ones included, deleted ones never).
//   - "Active / suspended / archived now" are today's numbers; the date range does not change them.
//   - Funnel: only schools created inside the range. "Has a subscription" = any subscription row;
//     "Became active" = a subscription that left Pending (it was paid or recorded); "Has a payment" = a captured payment.
//   - Days to activate = days from the school's creation to the start of its first non-pending subscription.
//   - "Value per month" of a school = the monthly price of its active plan WITHOUT GST (quarterly / 3, yearly / 12).

// WHERE pieces for the optional filters (fixed text; the values are bound parameters)
const filterSql = (filters) => {
  let sql = '';
  const replacements = {};

  if (filters.plan) {
    sql += ' AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.client_id = c.id AND s.deleted_at IS NULL AND s.plan_id IN (:planIds))';
    replacements.planIds = filters.plan.ids;
  }
  if (filters.status) {
    sql += ' AND c.status IN (:statuses)';
    replacements.statuses = filters.status;
  }

  return { sql, replacements };
};

const countBetween = async (from, to, extra) => {
  const [row] = await select(
    `SELECT COUNT(*)::int AS value FROM clients c WHERE c.deleted_at IS NULL AND c.created_at >= :from AND c.created_at <= :to${extra.sql}`,
    { from, to, ...extra.replacements },
  );
  return row.value;
};

const countUntil = async (to, extra) => {
  const [row] = await select(`SELECT COUNT(*)::int AS value FROM clients c WHERE c.deleted_at IS NULL AND c.created_at <= :to${extra.sql}`, { to, ...extra.replacements });
  return row.value;
};

// average days from creation to the first started subscription, for schools created in a window
const averageDaysToActivate = async (from, to, extra) => {
  const [row] = await select(
    `SELECT AVG(GREATEST(0, EXTRACT(EPOCH FROM (f.first_at - c.created_at)) / 86400.0)) AS value
       FROM clients c
       JOIN LATERAL (SELECT MIN(${startedAtSql('s')}) AS first_at FROM subscriptions s
                      WHERE s.client_id = c.id AND s.deleted_at IS NULL AND s.status <> 1) f ON f.first_at IS NOT NULL
      WHERE c.deleted_at IS NULL AND c.created_at >= :from AND c.created_at <= :to${extra.sql}`,
    { from, to, ...extra.replacements },
  );
  return roundOne(row.value);
};

module.exports = {
  key: 'schools.growth',
  area: 'schools',
  title: 'Schools',
  description: 'How many schools joined, how the base grew, where they are, and how sign-ups turn into paying schools.',
  filters: ['plan', 'status'],
  statusKind: 'school',
  exportTable: 'topSchools',

  async run({ range, filters }) {
    const extra = filterSql(filters);
    const buckets = bucketLabels(range);
    const labels = buckets.map((bucket) => bucket.label);
    const gstRate = await gstRatePercent();

    // ---- schools created per day / week / month, and the running total ----
    const created = await select(
      `SELECT ${bucketSql(range.granularity, 'c.created_at')} AS bucket, COUNT(*)::int AS value
         FROM clients c
        WHERE c.deleted_at IS NULL AND c.created_at >= :from AND c.created_at <= :to${extra.sql}
        GROUP BY 1`,
      { from: range.fromDate, to: range.toDate, ...extra.replacements },
    );
    const newPerBucket = fillBuckets(created, buckets);

    let running = await countUntil(new Date(range.fromDate.getTime() - 1), extra);
    const totalPerBucket = newPerBucket.map((value) => {
      running += value;
      return running;
    });

    const [totalNow, newInRange, daysToActivate, statusNow] = await Promise.all([
      countUntil(range.toDate, extra),
      countBetween(range.fromDate, range.toDate, extra),
      averageDaysToActivate(range.fromDate, range.toDate, extra),
      select(`SELECT c.status AS status, COUNT(*)::int AS value FROM clients c WHERE c.deleted_at IS NULL${extra.sql} GROUP BY c.status`, extra.replacements),
    ]);

    let totalBefore = null;
    let newBefore = null;
    let daysBefore = null;
    if (range.previous) {
      [totalBefore, newBefore, daysBefore] = await Promise.all([
        countUntil(range.previous.toDate, extra),
        countBetween(range.previous.fromDate, range.previous.toDate, extra),
        averageDaysToActivate(range.previous.fromDate, range.previous.toDate, extra),
      ]);
    }

    const nowCount = (status) => statusNow.find((row) => Number(row.status) === status)?.value ?? 0;

    // ---- by status as of the end of the range ----
    const statusRows = await select(
      `SELECT c.status AS status, COUNT(*)::int AS value FROM clients c WHERE c.deleted_at IS NULL AND c.created_at <= :to${extra.sql} GROUP BY c.status ORDER BY c.status`,
      { to: range.toDate, ...extra.replacements },
    );

    // ---- sign-up funnel for schools created in the range ----
    const [funnel] = await select(
      `SELECT COUNT(*)::int AS signed,
              COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM subscriptions s WHERE s.client_id = c.id AND s.deleted_at IS NULL))::int AS "withSubscription",
              COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM subscriptions s WHERE s.client_id = c.id AND s.deleted_at IS NULL AND s.status <> 1))::int AS "becameActive",
              COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM payments p WHERE p.client_id = c.id AND p.status IN (3, 5, 6)))::int AS "withPayment"
         FROM clients c
        WHERE c.deleted_at IS NULL AND c.created_at >= :from AND c.created_at <= :to${extra.sql}`,
      { from: range.fromDate, to: range.toDate, ...extra.replacements },
    );

    // ---- suspensions, archives and reactivations over time ----
    const changes = await select(
      `SELECT ${bucketSql(range.granularity, 'h.created_at')} AS bucket,
              COUNT(*) FILTER (WHERE h.to_status = 2)::int AS suspended,
              COUNT(*) FILTER (WHERE h.to_status = 3)::int AS archived,
              COUNT(*) FILTER (WHERE h.to_status = 1)::int AS reactivated
         FROM client_status_history h
         JOIN clients c ON c.id = h.client_id
        WHERE c.deleted_at IS NULL AND h.created_at >= :from AND h.created_at <= :to${extra.sql}
        GROUP BY 1`,
      { from: range.fromDate, to: range.toDate, ...extra.replacements },
    );

    // ---- schools per plan (schools with a running subscription) ----
    const byPlan = await select(
      `SELECT p.name AS label, COUNT(DISTINCT c.id)::int AS value
         FROM clients c
         JOIN subscriptions s ON s.client_id = c.id AND s.deleted_at IS NULL AND s.status IN (2, 3, 6)
         JOIN plans p ON p.id = s.plan_id
        WHERE c.deleted_at IS NULL${extra.sql}
        GROUP BY p.id, p.name
        ORDER BY value DESC, p.name
        LIMIT 12`,
      extra.replacements,
    );

    // ---- by state (top 10) and by state and city (table) ----
    const byState = await select(
      `SELECT COALESCE(NULLIF(TRIM(c.state), ''), 'Not set') AS label, COUNT(*)::int AS value
         FROM clients c
        WHERE c.deleted_at IS NULL AND c.created_at <= :to${extra.sql}
        GROUP BY 1
        ORDER BY value DESC, label
        LIMIT 6`,
      { to: range.toDate, ...extra.replacements },
    );

    const locations = await select(
      `SELECT COALESCE(NULLIF(TRIM(c.state), ''), 'Not set') AS state,
              COALESCE(NULLIF(TRIM(c.city), ''), 'Not set') AS city,
              COUNT(*)::int AS schools,
              COUNT(*) FILTER (WHERE c.status = 1)::int AS active,
              COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM subscriptions s WHERE s.client_id = c.id AND s.deleted_at IS NULL AND s.status IN (2, 3, 6)))::int AS paying
         FROM clients c
        WHERE c.deleted_at IS NULL AND c.created_at <= :to${extra.sql}
        GROUP BY 1, 2
        ORDER BY schools DESC, state, city
        LIMIT 25`,
      { to: range.toDate, ...extra.replacements },
    );

    // ---- the biggest schools by the monthly value of their active plan (without GST) ----
    const top = await select(
      `SELECT c.name AS school, p.name AS "planName", COALESCE(s.billing_interval, p.billing_interval) AS "interval",
              ROUND(${monthlyExGst('p', 's')})::bigint AS "monthlyPaise",
              ROUND(${periodPriceExGst('p')})::bigint AS "periodPaise",
              ${startedAtSql('s')} AS "since"
         FROM clients c
         JOIN subscriptions s ON s.client_id = c.id AND s.deleted_at IS NULL AND s.status = 2
         JOIN plans p ON p.id = s.plan_id
        WHERE c.deleted_at IS NULL${extra.sql}
        ORDER BY "monthlyPaise" DESC, c.name
        LIMIT 10`,
      { gstRate, ...extra.replacements },
    );

    return {
      kpis: [
        kpi({ key: 'totalSchools', label: 'Total schools', value: totalNow, previous: totalBefore, sparkline: totalPerBucket }),
        kpi({ key: 'newSchools', label: 'New schools', value: newInRange, previous: newBefore, sparkline: newPerBucket }),
        kpi({ key: 'activeSchools', label: 'Active now', value: nowCount(1) }),
        kpi({ key: 'suspendedSchools', label: 'Suspended now', value: nowCount(2) }),
        kpi({ key: 'archivedSchools', label: 'Archived now', value: nowCount(3) }),
        kpi({ key: 'daysToActivate', label: 'Days to activate', value: daysToActivate, previous: daysBefore, unit: 'days' }),
      ],
      series: {
        newSchools: { labels, datasets: [{ key: 'new', label: 'New schools', data: newPerBucket }] },
        totalSchools: { labels, datasets: [{ key: 'total', label: 'Total schools', data: totalPerBucket }] },
        funnel: {
          labels: ['Signed up', 'Subscribed', 'Active', 'Paid'],
          datasets: [{ key: 'schools', label: 'Schools', data: [funnel.signed, funnel.withSubscription, funnel.becameActive, funnel.withPayment] }],
        },
        statusChanges: {
          labels,
          datasets: [
            { key: 'suspended', label: 'Suspended', data: fillBuckets(changes, buckets, 'suspended') },
            { key: 'archived', label: 'Archived', data: fillBuckets(changes, buckets, 'archived') },
            { key: 'reactivated', label: 'Reactivated', data: fillBuckets(changes, buckets, 'reactivated') },
          ],
        },
        byPlan: { labels: byPlan.map((row) => row.label), datasets: [{ key: 'schools', label: 'Schools', data: byPlan.map((row) => row.value) }] },
        byState: { labels: byState.map((row) => row.label), datasets: [{ key: 'schools', label: 'Schools', data: byState.map((row) => row.value) }] },
      },
      breakdowns: {
        byStatus: statusRows.map((row) => ({ label: optionSets.label('schoolStatus', row.status), value: row.value })),
      },
      tables: {
        topSchools: {
          columns: [
            { key: 'school', label: 'School', type: 'text' },
            { key: 'planName', label: 'Plan', type: 'text' },
            { key: 'interval', label: 'Billed', type: 'text' },
            { key: 'periodPaise', label: 'Plan price (no GST)', type: 'money' },
            { key: 'monthlyPaise', label: 'Value per month', type: 'money' },
            { key: 'since', label: 'Active since', type: 'date' },
          ],
          rows: top.map((row) => ({ ...row, interval: optionSets.label('billingInterval', row.interval), monthlyPaise: Number(row.monthlyPaise), periodPaise: Number(row.periodPaise) })),
        },
        locations: {
          columns: [
            { key: 'state', label: 'State', type: 'text' },
            { key: 'city', label: 'City', type: 'text' },
            { key: 'schools', label: 'Schools', type: 'integer' },
            { key: 'active', label: 'Active', type: 'integer' },
            { key: 'paying', label: 'With a running plan', type: 'integer' },
          ],
          rows: locations,
        },
      },
    };
  },
};
