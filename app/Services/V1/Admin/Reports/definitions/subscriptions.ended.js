const { paged, toNumbers, applyCommonFilters } = require('../lib/sql');
const optionSets = require('../optionSets');

// Subscriptions that ended (cancelled or expired) during the period.
module.exports = {
  key: 'subscriptions.ended',
  area: 'subscriptions',
  title: 'Cancelled & expired',
  description: 'Subscriptions that were cancelled or expired during the period, with how long they lasted.',
  usesDateRange: true,

  filters: [
    {
      key: 'status',
      label: 'Outcome',
      type: 'select',
      options: [
        { value: 4, label: 'Cancelled' },
        { value: 5, label: 'Expired' },
      ],
    },
    { key: 'plan', label: 'Plan', type: 'select', options: 'plans' },
    { key: 'source', label: 'Source', type: 'select', options: 'billingSource' },
    { key: 'school', label: 'School', type: 'text' },
  ],

  columns: [
    { key: 'endedAt', label: 'Ended', type: 'datetime', width: 18 },
    { key: 'school', label: 'School', type: 'text', width: 30 },
    { key: 'planName', label: 'Plan', type: 'text', width: 20 },
    { key: 'status', label: 'Outcome', type: 'text', width: 12 },
    { key: 'source', label: 'Source', type: 'text', width: 16 },
    { key: 'startedAt', label: 'Started', type: 'datetime', width: 18 },
    { key: 'lifetimeDays', label: 'Lasted (days)', type: 'integer', width: 14 },
    { key: 'paidCount', label: 'Periods paid', type: 'integer', width: 12 },
    { key: 'cancelRequestedAt', label: 'Cancel requested', type: 'datetime', width: 18 },
  ],

  async run({ range, filters, page, perPage }) {
    const endedAt = 'COALESCE(s.ended_at, s.cancelled_at, s.updated_at)';
    const where = ['s.deleted_at IS NULL', `${endedAt} >= :from`, `${endedAt} <= :to`];
    const replacements = { from: range.fromDate, to: range.toDate };
    if (filters.status !== undefined) {
      where.push('s.status = :status');
      replacements.status = filters.status;
    } else {
      where.push('s.status IN (4, 5)');
    }
    await applyCommonFilters(filters, where, replacements);

    const sql = `SELECT ${endedAt} AS "endedAt", c.name AS school, p.name AS "planName", s.status, s.source,
                        s.started_at AS "startedAt",
                        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${endedAt} - COALESCE(s.started_at, s.created_at))) / 86400))::int AS "lifetimeDays",
                        s.paid_count AS "paidCount", s.cancel_requested_at AS "cancelRequestedAt"
                   FROM subscriptions s
                   JOIN clients c ON c.id = s.client_id
                   JOIN plans p ON p.id = s.plan_id
                  WHERE ${where.join(' AND ')}
                  ORDER BY ${endedAt} DESC, s.id DESC`;

    const result = await paged({ sql, replacements, page, perPage });

    return {
      rows: toNumbers(result.rows, []).map((row) => ({
        ...row,
        status: optionSets.label('subscriptionStatus', row.status),
        source: optionSets.label('billingSource', row.source),
      })),
      total: result.total,
    };
  },
};
