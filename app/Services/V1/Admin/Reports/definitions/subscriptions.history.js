const { paged, toNumbers, applyCommonFilters } = require('../lib/sql');
const optionSets = require('../optionSets');

// Every subscription a school ever had (all statuses), newest first inside each school. Type part of the school name to see one school.
module.exports = {
  key: 'subscriptions.history',
  area: 'subscriptions',
  title: 'History per school',
  description: 'Every subscription of every school, in every status. Search a school name to see one school only.',
  usesDateRange: false,

  filters: [
    { key: 'school', label: 'School', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: 'subscriptionStatus' },
    { key: 'plan', label: 'Plan', type: 'select', options: 'plans' },
    { key: 'source', label: 'Source', type: 'select', options: 'billingSource' },
  ],

  columns: [
    { key: 'school', label: 'School', type: 'text', width: 30 },
    { key: 'planName', label: 'Plan', type: 'text', width: 20 },
    { key: 'status', label: 'Status', type: 'text', width: 12 },
    { key: 'source', label: 'Source', type: 'text', width: 16 },
    { key: 'startedAt', label: 'Started', type: 'datetime', width: 18 },
    { key: 'currentPeriodStart', label: 'Period starts', type: 'datetime', width: 18 },
    { key: 'currentPeriodEnd', label: 'Period ends', type: 'datetime', width: 18 },
    { key: 'endedAt', label: 'Ended', type: 'datetime', width: 18 },
    { key: 'amountPaise', label: 'Amount', type: 'money', width: 14 },
    { key: 'paidCount', label: 'Periods paid', type: 'integer', width: 12 },
    { key: 'razorpaySubscriptionId', label: 'Razorpay subscription', type: 'text', width: 26 },
    { key: 'createdAt', label: 'Created', type: 'datetime', width: 18 },
  ],

  async run({ filters, page, perPage }) {
    const where = ['s.deleted_at IS NULL'];
    const replacements = {};
    if (filters.status !== undefined) {
      where.push('s.status = :status');
      replacements.status = filters.status;
    }
    await applyCommonFilters(filters, where, replacements);

    const sql = `SELECT c.name AS school, p.name AS "planName", s.status, s.source, s.started_at AS "startedAt",
                        s.current_period_start AS "currentPeriodStart", s.current_period_end AS "currentPeriodEnd",
                        COALESCE(s.ended_at, s.cancelled_at) AS "endedAt", s.amount_paise AS "amountPaise", s.paid_count AS "paidCount",
                        COALESCE(s.razorpay_subscription_id, '') AS "razorpaySubscriptionId", s.created_at AS "createdAt"
                   FROM subscriptions s
                   JOIN clients c ON c.id = s.client_id
                   JOIN plans p ON p.id = s.plan_id
                  WHERE ${where.join(' AND ')}
                  ORDER BY c.name ASC, c.id ASC, s.id DESC`;

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
