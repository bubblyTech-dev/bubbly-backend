const { like, paged, gstRatePercent, mrrSql, toNumbers, oneRowToNumbers } = require('../lib/sql');
const optionSets = require('../optionSets');

// How many schools are on each plan, by subscription status, and the monthly recurring revenue each plan brings.
// MRR is without GST: yearly plans count 1/12 and quarterly plans 1/3 of their price, GST is taken out of tax-inclusive prices.
module.exports = {
  key: 'plans.subscribers',
  area: 'plans',
  title: 'Subscribers per plan',
  description: 'Schools on each plan by subscription status, and monthly recurring revenue (without GST) from the active ones.',
  usesDateRange: false,

  filters: [
    { key: 'status', label: 'Plan status', type: 'select', options: 'planStatus' },
    { key: 'interval', label: 'Billing period', type: 'select', options: 'billingInterval' },
    { key: 'search', label: 'Search plan', type: 'text' },
  ],

  columns: [
    { key: 'planName', label: 'Plan', type: 'text', width: 24 },
    { key: 'planStatus', label: 'Plan status', type: 'text', width: 12 },
    { key: 'interval', label: 'Billing period', type: 'text', width: 14 },
    { key: 'active', label: 'Active', type: 'integer', width: 10 },
    { key: 'activeOnline', label: 'Active (online)', type: 'integer', width: 14 },
    { key: 'activeOffline', label: 'Active (offline)', type: 'integer', width: 14 },
    { key: 'pastDue', label: 'Past due', type: 'integer', width: 10 },
    { key: 'suspended', label: 'Suspended', type: 'integer', width: 11 },
    { key: 'pending', label: 'Pending', type: 'integer', width: 10 },
    { key: 'cancelled', label: 'Cancelled', type: 'integer', width: 11 },
    { key: 'expired', label: 'Expired', type: 'integer', width: 10 },
    { key: 'total', label: 'All time', type: 'integer', width: 10 },
    { key: 'mrrPaise', label: 'Monthly recurring revenue', type: 'money', width: 20 },
  ],

  async run({ filters, page, perPage }) {
    const where = ['p.deleted_at IS NULL'];
    const replacements = { gstRate: await gstRatePercent() };

    if (filters.status !== undefined) {
      where.push('p.status = :status');
      replacements.status = filters.status;
    }
    if (filters.interval !== undefined) {
      where.push('p.billing_interval = :interval');
      replacements.interval = filters.interval;
    }
    if (filters.search) {
      where.push('p.name ILIKE :q');
      replacements.q = like(filters.search);
    }

    const sql = `SELECT p.name AS "planName", p.status AS "planStatus", p.billing_interval AS interval,
                        (COUNT(s.id) FILTER (WHERE s.status = 2))::int AS active,
                        (COUNT(s.id) FILTER (WHERE s.status = 2 AND s.source = 1))::int AS "activeOnline",
                        (COUNT(s.id) FILTER (WHERE s.status = 2 AND s.source = 2))::int AS "activeOffline",
                        (COUNT(s.id) FILTER (WHERE s.status = 3))::int AS "pastDue",
                        (COUNT(s.id) FILTER (WHERE s.status = 6))::int AS suspended,
                        (COUNT(s.id) FILTER (WHERE s.status = 1))::int AS pending,
                        (COUNT(s.id) FILTER (WHERE s.status = 4))::int AS cancelled,
                        (COUNT(s.id) FILTER (WHERE s.status = 5))::int AS expired,
                        COUNT(s.id)::int AS total,
                        COALESCE(SUM(${mrrSql('s', 'p')}) FILTER (WHERE s.status = 2), 0)::float8 AS "mrrPaise"
                   FROM plans p
                   LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.deleted_at IS NULL
                  WHERE ${where.join(' AND ')}
                  GROUP BY p.id
                  ORDER BY "mrrPaise" DESC, active DESC, p.name ASC, p.id ASC`;

    const totalsSql = `SELECT COALESCE(SUM(t.active), 0)::int AS active, COALESCE(SUM(t."activeOnline"), 0)::int AS "activeOnline",
                              COALESCE(SUM(t."activeOffline"), 0)::int AS "activeOffline", COALESCE(SUM(t."pastDue"), 0)::int AS "pastDue",
                              COALESCE(SUM(t.suspended), 0)::int AS suspended, COALESCE(SUM(t.pending), 0)::int AS pending,
                              COALESCE(SUM(t.cancelled), 0)::int AS cancelled, COALESCE(SUM(t.expired), 0)::int AS expired,
                              COALESCE(SUM(t.total), 0)::int AS total, COALESCE(SUM(t."mrrPaise"), 0)::float8 AS "mrrPaise"
                         FROM (${sql}) t`;

    const result = await paged({ sql, replacements, page, perPage, totalsSql });

    return {
      rows: toNumbers(result.rows, ['mrrPaise']).map((row) => ({
        ...row,
        planStatus: optionSets.label('planStatus', row.planStatus),
        interval: optionSets.label('billingInterval', row.interval),
      })),
      total: result.total,
      totals: oneRowToNumbers(result.totals, ['mrrPaise']),
    };
  },
};
