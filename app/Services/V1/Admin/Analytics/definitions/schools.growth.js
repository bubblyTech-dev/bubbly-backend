const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const optionSets = require('../../Reports/optionSets');
const { bucketLabels, bucketSql, fillBuckets, kpi } = require('../series');

// REFERENCE DEFINITION: copy this file to start a new analytics dataset.
//
// What it shows: how many schools joined, how the total grew, and how schools split by status.
// Filters honoured: plan (schools that have a subscription on the plan) and status (school status).
//
// Conventions used here (follow them in your own definitions):
//  - run() receives the resolved range and the checked filters, and returns plain numbers/strings.
//  - SQL is parameterised: values go in `replacements`, never into the SQL text.
//  - Money would be returned in paise (this dataset has none).
//  - Time series use bucketLabels / bucketSql / fillBuckets so empty days show as 0.

// the WHERE pieces for the optional filters (fixed text; the values are bound parameters)
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

const select = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

const countBetween = async (from, to, filters) => {
  const extra = filterSql(filters);
  const [row] = await select(
    `SELECT COUNT(*)::int AS value FROM clients c WHERE c.deleted_at IS NULL AND c.created_at >= :from AND c.created_at <= :to${extra.sql}`,
    { from, to, ...extra.replacements },
  );
  return row.value;
};

const countUntil = async (to, filters) => {
  const extra = filterSql(filters);
  const [row] = await select(`SELECT COUNT(*)::int AS value FROM clients c WHERE c.deleted_at IS NULL AND c.created_at <= :to${extra.sql}`, { to, ...extra.replacements });
  return row.value;
};

module.exports = {
  key: 'schools.growth',
  area: 'schools',
  title: 'School growth',
  description: 'How many schools joined, how the total grew and how schools split by status.',
  filters: ['plan', 'status'],
  statusKind: 'school',
  exportTable: 'newSchools',

  async run({ range, filters }) {
    const extra = filterSql(filters);
    const buckets = bucketLabels(range);

    // schools created per day / week / month
    const created = await select(
      `SELECT ${bucketSql(range.granularity, 'c.created_at')} AS bucket, COUNT(*)::int AS value
         FROM clients c
        WHERE c.deleted_at IS NULL AND c.created_at >= :from AND c.created_at <= :to${extra.sql}
        GROUP BY 1`,
      { from: range.fromDate, to: range.toDate, ...extra.replacements },
    );
    const newPerBucket = fillBuckets(created, buckets);

    // the running total: everything before the range, then add each bucket
    let running = await countUntil(new Date(range.fromDate.getTime() - 1), filters);
    const totalPerBucket = newPerBucket.map((value) => {
      running += value;
      return running;
    });

    const [totalNow, newInRange, activeNow] = await Promise.all([
      countUntil(range.toDate, filters),
      countBetween(range.fromDate, range.toDate, filters),
      select(`SELECT COUNT(*)::int AS value FROM clients c WHERE c.deleted_at IS NULL AND c.status = 1${extra.sql}`, extra.replacements).then((rows) => rows[0].value),
    ]);

    let totalBefore = null;
    let newBefore = null;
    if (range.previous) {
      [totalBefore, newBefore] = await Promise.all([countUntil(range.previous.toDate, filters), countBetween(range.previous.fromDate, range.previous.toDate, filters)]);
    }

    // schools by status (as of the end of the range)
    const statusRows = await select(
      `SELECT c.status AS status, COUNT(*)::int AS value FROM clients c WHERE c.deleted_at IS NULL AND c.created_at <= :to${extra.sql} GROUP BY c.status ORDER BY c.status`,
      { to: range.toDate, ...extra.replacements },
    );

    // the newest schools in the range (also what the Export menu downloads)
    const newest = await select(
      `SELECT c.name, c.city, c.state, c.contact_email AS "contactEmail", c.status, c.created_at AS "createdAt",
              (SELECT p.name FROM subscriptions s JOIN plans p ON p.id = s.plan_id
                WHERE s.client_id = c.id AND s.deleted_at IS NULL ORDER BY s.id DESC LIMIT 1) AS "planName"
         FROM clients c
        WHERE c.deleted_at IS NULL AND c.created_at >= :from AND c.created_at <= :to${extra.sql}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT 500`,
      { from: range.fromDate, to: range.toDate, ...extra.replacements },
    );

    return {
      kpis: [
        kpi({ key: 'totalSchools', label: 'Total schools', value: totalNow, previous: totalBefore, sparkline: totalPerBucket }),
        kpi({ key: 'newSchools', label: 'New schools', value: newInRange, previous: newBefore, sparkline: newPerBucket }),
        kpi({ key: 'activeSchools', label: 'Active schools now', value: activeNow }),
      ],
      series: {
        newSchools: { labels: buckets.map((bucket) => bucket.label), datasets: [{ key: 'new', label: 'New schools', data: newPerBucket }] },
        totalSchools: { labels: buckets.map((bucket) => bucket.label), datasets: [{ key: 'total', label: 'Total schools', data: totalPerBucket }] },
      },
      breakdowns: {
        byStatus: statusRows.map((row) => ({ label: optionSets.label('schoolStatus', row.status), value: row.value })),
      },
      tables: {
        newSchools: {
          columns: [
            { key: 'name', label: 'School', type: 'text' },
            { key: 'city', label: 'City', type: 'text' },
            { key: 'state', label: 'State', type: 'text' },
            { key: 'planName', label: 'Plan', type: 'text' },
            { key: 'status', label: 'Status', type: 'text' },
            { key: 'contactEmail', label: 'Contact email', type: 'text' },
            { key: 'createdAt', label: 'Joined', type: 'datetime' },
          ],
          rows: newest.map((row) => ({ ...row, status: optionSets.label('schoolStatus', row.status) })),
        },
      },
    };
  },
};
