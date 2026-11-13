const Settings = require('@app/Helpers/settings');
const { paged, toNumbers, oneRowToNumbers, applyCommonFilters } = require('../lib/sql');

// Money that should have come in but has not: Past due subscriptions, with how long and how much grace is left.
module.exports = {
  key: 'billing.outstanding',
  area: 'billing',
  title: 'Outstanding & overdue',
  description: 'Past due subscriptions with the amount owed, days overdue and when the grace period ends (Settings > Policy).',
  usesDateRange: false,

  filters: [
    { key: 'plan', label: 'Plan', type: 'select', options: 'plans' },
    { key: 'source', label: 'Source', type: 'select', options: 'billingSource' },
    { key: 'school', label: 'School', type: 'text' },
  ],

  columns: [
    { key: 'school', label: 'School', type: 'text', width: 30 },
    { key: 'planName', label: 'Plan', type: 'text', width: 20 },
    { key: 'amountPaise', label: 'Amount owed', type: 'money', width: 16 },
    { key: 'since', label: 'Overdue since', type: 'datetime', width: 18 },
    { key: 'daysOverdue', label: 'Days overdue', type: 'integer', width: 13 },
    { key: 'graceEnds', label: 'Grace ends', type: 'date', width: 14 },
    { key: 'graceStatus', label: 'Grace', type: 'text', width: 14 },
    { key: 'contactName', label: 'Contact person', type: 'text', width: 22 },
    { key: 'contactEmail', label: 'Contact email', type: 'text', width: 28 },
    { key: 'contactPhone', label: 'Phone', type: 'text', width: 16 },
  ],

  async run({ filters, page, perPage }) {
    const graceDays = Math.max(0, Number(await Settings.get('policy.grace_days')) || 0);
    const where = ['s.status = 3', 's.deleted_at IS NULL', 'c.deleted_at IS NULL'];
    const replacements = { graceDays };
    await applyCommonFilters(filters, where, replacements);

    const since = 'COALESCE(s.past_due_since, s.updated_at)';
    const from = `FROM subscriptions s
                  JOIN clients c ON c.id = s.client_id
                  JOIN plans p ON p.id = s.plan_id
                 WHERE ${where.join(' AND ')}`;

    const sql = `SELECT c.name AS school, p.name AS "planName", s.amount_paise AS "amountPaise", ${since} AS since,
                        FLOOR(EXTRACT(EPOCH FROM (NOW() - ${since})) / 86400)::int AS "daysOverdue",
                        to_char((${since} AT TIME ZONE 'Asia/Kolkata')::date + :graceDays, 'YYYY-MM-DD') AS "graceEnds",
                        c.contact_name AS "contactName", c.contact_email AS "contactEmail", c.contact_phone AS "contactPhone"
                  ${from}
                  ORDER BY ${since} ASC, s.id ASC`;
    const totalsSql = `SELECT COALESCE(SUM(s.amount_paise), 0)::float8 AS "amountPaise" ${from}`;

    const result = await paged({ sql, replacements, page, perPage, totalsSql });

    return {
      rows: toNumbers(result.rows, ['amountPaise']).map((row) => ({
        ...row,
        graceStatus: Number(row.daysOverdue) <= graceDays ? 'In grace' : 'Grace over',
      })),
      total: result.total,
      totals: oneRowToNumbers(result.totals, ['amountPaise']),
    };
  },
};
