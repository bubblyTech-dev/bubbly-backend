const { like, paged } = require('../lib/sql');
const optionSets = require('../optionSets');

// Schools that have no Active subscription right now: never subscribed, payment failed, cancelled, expired or suspended.
module.exports = {
  key: 'schools.without_subscription',
  area: 'schools',
  title: 'Without an active subscription',
  description: 'Schools with no Active subscription today, with their last plan and what happened to it.',
  usesDateRange: false,

  filters: [
    { key: 'status', label: 'School status', type: 'select', options: 'schoolStatus' },
    { key: 'search', label: 'Search', type: 'text' },
  ],

  columns: [
    { key: 'name', label: 'School', type: 'text', width: 30 },
    { key: 'status', label: 'School status', type: 'text', width: 14 },
    { key: 'contactName', label: 'Contact person', type: 'text', width: 22 },
    { key: 'contactEmail', label: 'Contact email', type: 'text', width: 28 },
    { key: 'contactPhone', label: 'Phone', type: 'text', width: 16 },
    { key: 'lastPlan', label: 'Last plan', type: 'text', width: 18 },
    { key: 'lastSubscriptionStatus', label: 'Last subscription', type: 'text', width: 18 },
    { key: 'lastEndedAt', label: 'Last ended', type: 'datetime', width: 18 },
    { key: 'daysSinceJoined', label: 'Days since joined', type: 'integer', width: 16 },
    { key: 'createdAt', label: 'Joined', type: 'datetime', width: 18 },
  ],

  async run({ filters, page, perPage }) {
    const where = [
      'c.deleted_at IS NULL',
      'NOT EXISTS (SELECT 1 FROM subscriptions a WHERE a.client_id = c.id AND a.status = 2 AND a.deleted_at IS NULL)',
    ];
    const replacements = {};

    if (filters.status !== undefined) {
      where.push('c.status = :status');
      replacements.status = filters.status;
    }
    if (filters.search) {
      where.push('(c.name ILIKE :q OR c.contact_name ILIKE :q OR c.contact_email ILIKE :q OR c.city ILIKE :q)');
      replacements.q = like(filters.search);
    }

    const sql = `SELECT c.name, c.status, c.contact_name AS "contactName", c.contact_email AS "contactEmail", c.contact_phone AS "contactPhone",
                        p.name AS "lastPlan", latest.status AS "lastSubscriptionStatus",
                        COALESCE(latest.ended_at, latest.cancelled_at, latest.current_period_end) AS "lastEndedAt",
                        FLOOR(EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 86400)::int AS "daysSinceJoined",
                        c.created_at AS "createdAt"
                   FROM clients c
                   LEFT JOIN LATERAL (
                     SELECT s.plan_id, s.status, s.ended_at, s.cancelled_at, s.current_period_end
                       FROM subscriptions s
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
        lastSubscriptionStatus: row.lastSubscriptionStatus ? optionSets.label('subscriptionStatus', row.lastSubscriptionStatus) : 'Never subscribed',
      })),
      total: result.total,
    };
  },
};
