const { paged, toNumbers, applyCommonFilters } = require('../lib/sql');
const optionSets = require('../optionSets');

// Subscriptions that need attention today: Past due (a payment failed) and Suspended (stopped for non-payment).
module.exports = {
  key: 'subscriptions.problem',
  area: 'subscriptions',
  title: 'Past due & suspended',
  description: 'Subscriptions with a failed payment or suspended for non-payment, oldest first, with contact details for follow-up.',
  usesDateRange: false,

  filters: [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 3, label: 'Past due' },
        { value: 6, label: 'Suspended' },
      ],
    },
    { key: 'plan', label: 'Plan', type: 'select', options: 'plans' },
    { key: 'source', label: 'Source', type: 'select', options: 'billingSource' },
    { key: 'school', label: 'School', type: 'text' },
  ],

  columns: [
    { key: 'school', label: 'School', type: 'text', width: 30 },
    { key: 'planName', label: 'Plan', type: 'text', width: 20 },
    { key: 'status', label: 'Status', type: 'text', width: 12 },
    { key: 'source', label: 'Source', type: 'text', width: 16 },
    { key: 'since', label: 'Since', type: 'datetime', width: 18 },
    { key: 'daysSince', label: 'Days', type: 'integer', width: 9 },
    { key: 'amountPaise', label: 'Amount', type: 'money', width: 14 },
    { key: 'contactName', label: 'Contact person', type: 'text', width: 22 },
    { key: 'contactEmail', label: 'Contact email', type: 'text', width: 28 },
    { key: 'contactPhone', label: 'Phone', type: 'text', width: 16 },
  ],

  async run({ filters, page, perPage }) {
    const where = ['s.deleted_at IS NULL', 'c.deleted_at IS NULL'];
    const replacements = {};
    if (filters.status !== undefined) {
      where.push('s.status = :status');
      replacements.status = filters.status;
    } else {
      where.push('s.status IN (3, 6)');
    }
    await applyCommonFilters(filters, where, replacements);

    const since = 'CASE WHEN s.status = 3 THEN COALESCE(s.past_due_since, s.updated_at) ELSE s.updated_at END';

    const sql = `SELECT c.name AS school, p.name AS "planName", s.status, s.source, ${since} AS since,
                        FLOOR(EXTRACT(EPOCH FROM (NOW() - (${since}))) / 86400)::int AS "daysSince",
                        s.amount_paise AS "amountPaise", c.contact_name AS "contactName", c.contact_email AS "contactEmail", c.contact_phone AS "contactPhone"
                   FROM subscriptions s
                   JOIN clients c ON c.id = s.client_id
                   JOIN plans p ON p.id = s.plan_id
                  WHERE ${where.join(' AND ')}
                  ORDER BY ${since} ASC, s.id ASC`;

    const result = await paged({ sql, replacements, page, perPage });

    return {
      rows: toNumbers(result.rows, ['amountPaise']).map((row) => ({
        ...row,
        status: optionSets.label('subscriptionStatus', row.status),
        source: optionSets.label('billingSource', row.source),
      })),
      total: result.total,
    };
  },
};
