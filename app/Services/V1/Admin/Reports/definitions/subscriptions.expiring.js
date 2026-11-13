const Settings = require('@app/Helpers/settings');
const { paged, toNumbers, applyCommonFilters } = require('../lib/sql');
const optionSets = require('../optionSets');

// Active subscriptions whose current period ends soon (or already ended but nothing has renewed it yet).
module.exports = {
  key: 'subscriptions.expiring',
  area: 'subscriptions',
  title: 'Expiring soon',
  description: 'Active subscriptions whose current period ends within the chosen number of days, or has already ended.',
  usesDateRange: false,

  filters: [
    {
      key: 'days',
      label: 'Ends within',
      type: 'select',
      options: [
        { value: 7, label: '7 days' },
        { value: 14, label: '14 days' },
        { value: 30, label: '30 days' },
        { value: 60, label: '60 days' },
        { value: 90, label: '90 days' },
      ],
    },
    { key: 'plan', label: 'Plan', type: 'select', options: 'plans' },
    { key: 'source', label: 'Source', type: 'select', options: 'billingSource' },
    { key: 'school', label: 'School', type: 'text' },
  ],

  columns: [
    { key: 'school', label: 'School', type: 'text', width: 30 },
    { key: 'planName', label: 'Plan', type: 'text', width: 20 },
    { key: 'interval', label: 'Billing period', type: 'text', width: 14 },
    { key: 'source', label: 'Source', type: 'text', width: 16 },
    { key: 'currentPeriodEnd', label: 'Period ends', type: 'datetime', width: 18 },
    { key: 'daysLeft', label: 'Days left', type: 'integer', width: 11 },
    { key: 'whatNext', label: 'What happens next', type: 'text', width: 24 },
    { key: 'amountPaise', label: 'Amount', type: 'money', width: 14 },
    { key: 'contactEmail', label: 'Contact email', type: 'text', width: 28 },
  ],

  async run({ filters, page, perPage }) {
    // without a choice the window is the "due soon" setting from Settings > Renewals
    const days = filters.days !== undefined ? Number(filters.days) : Number(await Settings.get('renewals.due_soon_days')) || 7;
    const where = ['s.status = 2', 's.deleted_at IS NULL', 'c.deleted_at IS NULL', 's.current_period_end IS NOT NULL', "s.current_period_end <= NOW() + (:days * INTERVAL '1 day')"];
    const replacements = { days };
    await applyCommonFilters(filters, where, replacements);

    const sql = `SELECT c.name AS school, p.name AS "planName", s.billing_interval AS interval, s.source,
                        s.current_period_end AS "currentPeriodEnd",
                        CEIL(EXTRACT(EPOCH FROM (s.current_period_end - NOW())) / 86400)::int AS "daysLeft",
                        s.cancel_at_cycle_end AS "cancelAtCycleEnd", s.amount_paise AS "amountPaise", c.contact_email AS "contactEmail"
                   FROM subscriptions s
                   JOIN clients c ON c.id = s.client_id
                   JOIN plans p ON p.id = s.plan_id
                  WHERE ${where.join(' AND ')}
                  ORDER BY s.current_period_end ASC, s.id ASC`;

    const result = await paged({ sql, replacements, page, perPage });

    return {
      rows: toNumbers(result.rows, ['amountPaise']).map(({ cancelAtCycleEnd, ...row }) => ({
        ...row,
        interval: optionSets.label('billingInterval', row.interval),
        whatNext:
          Number(cancelAtCycleEnd) === 1 ? 'Ends (cancel requested)' : Number(row.source) === 2 ? 'Needs a new payment' : 'Renews automatically',
        source: optionSets.label('billingSource', row.source),
      })),
      total: result.total,
    };
  },
};
