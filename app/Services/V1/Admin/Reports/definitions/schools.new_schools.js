const { planIdOf, like, paged } = require('../lib/sql');
const optionSets = require('../optionSets');

// Schools that joined during the chosen period (by the day the school was added).
module.exports = {
  key: 'schools.new_schools',
  area: 'schools',
  title: 'New schools',
  description: 'Schools added during the period, with their plan and subscription status.',
  usesDateRange: true,

  filters: [
    { key: 'status', label: 'School status', type: 'select', options: 'schoolStatus' },
    { key: 'plan', label: 'Plan', type: 'select', options: 'plans' },
    { key: 'search', label: 'Search', type: 'text' },
  ],

  columns: [
    { key: 'createdAt', label: 'Joined', type: 'datetime', width: 18 },
    { key: 'name', label: 'School', type: 'text', width: 30 },
    { key: 'status', label: 'Status', type: 'text', width: 12 },
    { key: 'contactName', label: 'Contact person', type: 'text', width: 22 },
    { key: 'contactEmail', label: 'Contact email', type: 'text', width: 28 },
    { key: 'city', label: 'City', type: 'text', width: 16 },
    { key: 'state', label: 'State', type: 'text', width: 16 },
    { key: 'planName', label: 'Plan', type: 'text', width: 18 },
    { key: 'subscriptionStatus', label: 'Subscription', type: 'text', width: 14 },
  ],

  async run({ range, filters, page, perPage }) {
    const where = ['c.deleted_at IS NULL', 'c.created_at >= :from', 'c.created_at <= :to'];
    const replacements = { from: range.fromDate, to: range.toDate };

    if (filters.status !== undefined) {
      where.push('c.status = :status');
      replacements.status = filters.status;
    }
    if (filters.plan) {
      where.push('latest.plan_id = :planId');
      replacements.planId = await planIdOf(filters.plan);
    }
    if (filters.search) {
      where.push('(c.name ILIKE :q OR c.contact_name ILIKE :q OR c.contact_email ILIKE :q OR c.city ILIKE :q)');
      replacements.q = like(filters.search);
    }

    const sql = `SELECT c.created_at AS "createdAt", c.name, c.status, c.contact_name AS "contactName", c.contact_email AS "contactEmail",
                        c.city, c.state, p.name AS "planName", latest.status AS "subscriptionStatus"
                   FROM clients c
                   LEFT JOIN LATERAL (
                     SELECT s.plan_id, s.status FROM subscriptions s
                      WHERE s.client_id = c.id AND s.deleted_at IS NULL
                      ORDER BY s.id DESC LIMIT 1
                   ) latest ON TRUE
                   LEFT JOIN plans p ON p.id = latest.plan_id
                  WHERE ${where.join(' AND ')}
                  ORDER BY c.created_at DESC, c.id DESC`;

    const result = await paged({ sql, replacements, page, perPage });

    return {
      rows: result.rows.map((row) => ({
        ...row,
        status: optionSets.label('schoolStatus', row.status),
        subscriptionStatus: row.subscriptionStatus ? optionSets.label('subscriptionStatus', row.subscriptionStatus) : '',
      })),
      total: result.total,
    };
  },
};
