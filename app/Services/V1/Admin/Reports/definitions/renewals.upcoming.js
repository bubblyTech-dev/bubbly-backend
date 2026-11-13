const Settings = require('@app/Helpers/settings');
const { paged, toNumbers, oneRowToNumbers, gstRatePercent, periodPriceExGstSql, applyCommonFilters } = require('../lib/sql');
const optionSets = require('../optionSets');

// Renewals that are expected in the window: Active subscriptions that will be charged again (not the ones set to end).
// Online subscriptions are charged automatically unless the amount is above the automatic-charge limit (Settings > Billing),
// offline subscriptions need a new payment recorded by staff.
module.exports = {
  key: 'renewals.upcoming',
  area: 'renewals',
  title: 'Upcoming renewals',
  description: 'Active subscriptions due to renew in the window, with the amount and how the money will be collected.',
  usesDateRange: false,

  filters: [
    {
      key: 'days',
      label: 'Due within',
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
    { key: 'dueAt', label: 'Due', type: 'datetime', width: 18 },
    { key: 'daysLeft', label: 'Days left', type: 'integer', width: 11 },
    { key: 'school', label: 'School', type: 'text', width: 30 },
    { key: 'planName', label: 'Plan', type: 'text', width: 20 },
    { key: 'interval', label: 'Billing period', type: 'text', width: 14 },
    { key: 'amountPaise', label: 'Amount', type: 'money', width: 14 },
    { key: 'amountExGstPaise', label: 'Amount without GST', type: 'money', width: 18 },
    { key: 'collection', label: 'How it is collected', type: 'text', width: 30 },
    { key: 'contactEmail', label: 'Contact email', type: 'text', width: 28 },
  ],

  async run({ filters, page, perPage }) {
    const days = filters.days !== undefined ? Number(filters.days) : Number(await Settings.get('renewals.due_soon_days')) || 7;
    const limitRupees = Number(await Settings.get('billing.max_auto_charge_rupees')) || 15000;
    const due = 'COALESCE(s.next_charge_at, s.current_period_end)';
    const where = [
      's.status = 2',
      's.deleted_at IS NULL',
      'c.deleted_at IS NULL',
      's.cancel_at_cycle_end = 0',
      `${due} IS NOT NULL`,
      `${due} >= NOW()`,
      `${due} <= NOW() + (:days * INTERVAL '1 day')`,
    ];
    const replacements = { days, gstRate: await gstRatePercent() };
    await applyCommonFilters(filters, where, replacements);

    const from = `FROM subscriptions s
                  JOIN clients c ON c.id = s.client_id
                  JOIN plans p ON p.id = s.plan_id
                 WHERE ${where.join(' AND ')}`;

    const sql = `SELECT ${due} AS "dueAt", CEIL(EXTRACT(EPOCH FROM (${due} - NOW())) / 86400)::int AS "daysLeft", c.name AS school, p.name AS "planName",
                        s.billing_interval AS interval, s.amount_paise AS "amountPaise", ${periodPriceExGstSql('p')}::bigint AS "amountExGstPaise",
                        s.source, c.contact_email AS "contactEmail"
                  ${from}
                  ORDER BY ${due} ASC, s.id ASC`;
    const totalsSql = `SELECT COALESCE(SUM(s.amount_paise), 0)::float8 AS "amountPaise", COALESCE(SUM(${periodPriceExGstSql('p')}), 0)::float8 AS "amountExGstPaise" ${from}`;

    const result = await paged({ sql, replacements, page, perPage, totalsSql });

    return {
      rows: toNumbers(result.rows, ['amountPaise', 'amountExGstPaise']).map(({ source, ...row }) => {
        let collection = 'Automatic charge';
        if (Number(source) === 2) collection = 'Manual: staff records the payment';
        else if (row.amountPaise / 100 > limitRupees) collection = 'Above the automatic-charge limit: may need manual payment';
        return { ...row, interval: optionSets.label('billingInterval', row.interval), collection };
      }),
      total: result.total,
      totals: oneRowToNumbers(result.totals, ['amountPaise', 'amountExGstPaise']),
    };
  },
};
