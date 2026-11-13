const { paged, gstRatePercent, mrrSql, toNumbers, oneRowToNumbers, applyCommonFilters } = require('../lib/sql');
const optionSets = require('../optionSets');

// Every school with an Active subscription, what it pays and when the current period ends.
module.exports = {
  key: 'subscriptions.active',
  area: 'subscriptions',
  title: 'Active subscriptions',
  description: 'Schools with an Active subscription, the amount charged each period and the monthly recurring revenue (without GST).',
  usesDateRange: false,

  filters: [
    { key: 'plan', label: 'Plan', type: 'select', options: 'plans' },
    { key: 'source', label: 'Source', type: 'select', options: 'billingSource' },
    { key: 'interval', label: 'Billing period', type: 'select', options: 'billingInterval' },
    { key: 'school', label: 'School', type: 'text' },
  ],

  columns: [
    { key: 'school', label: 'School', type: 'text', width: 30 },
    { key: 'planName', label: 'Plan', type: 'text', width: 20 },
    { key: 'interval', label: 'Billing period', type: 'text', width: 14 },
    { key: 'source', label: 'Source', type: 'text', width: 16 },
    { key: 'amountPaise', label: 'Charged each period', type: 'money', width: 18 },
    { key: 'mrrPaise', label: 'Monthly revenue (without GST)', type: 'money', width: 22 },
    { key: 'startedAt', label: 'Started', type: 'datetime', width: 18 },
    { key: 'currentPeriodEnd', label: 'Period ends', type: 'datetime', width: 18 },
    { key: 'nextChargeAt', label: 'Next charge', type: 'datetime', width: 18 },
    { key: 'paidCount', label: 'Periods paid', type: 'integer', width: 12 },
  ],

  async run({ filters, page, perPage }) {
    const where = ['s.status = 2', 's.deleted_at IS NULL', 'c.deleted_at IS NULL'];
    const replacements = { gstRate: await gstRatePercent() };
    await applyCommonFilters(filters, where, replacements);
    if (filters.interval !== undefined) {
      where.push('s.billing_interval = :interval');
      replacements.interval = filters.interval;
    }

    const from = `FROM subscriptions s
                  JOIN clients c ON c.id = s.client_id
                  JOIN plans p ON p.id = s.plan_id
                 WHERE ${where.join(' AND ')}`;

    const sql = `SELECT c.name AS school, p.name AS "planName", s.billing_interval AS interval, s.source,
                        s.amount_paise AS "amountPaise", ${mrrSql('s', 'p')}::bigint AS "mrrPaise",
                        s.started_at AS "startedAt", s.current_period_end AS "currentPeriodEnd", s.next_charge_at AS "nextChargeAt",
                        s.paid_count AS "paidCount"
                  ${from}
                  ORDER BY c.name ASC, s.id ASC`;
    const totalsSql = `SELECT COALESCE(SUM(${mrrSql('s', 'p')}), 0)::float8 AS "mrrPaise" ${from}`;

    const result = await paged({ sql, replacements, page, perPage, totalsSql });

    return {
      rows: toNumbers(result.rows, ['amountPaise', 'mrrPaise']).map((row) => ({
        ...row,
        interval: optionSets.label('billingInterval', row.interval),
        source: optionSets.label('billingSource', row.source),
      })),
      total: result.total,
      totals: oneRowToNumbers(result.totals, ['mrrPaise']),
    };
  },
};
