const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const { contains, jsonNumber } = require('../support/common');
const { visibleToViewer, SENSITIVE_ACTIONS, CATEGORIES } = require('../support/audit');

// The actions that matter most for control and money: refunds, offline payments, subscription changes, staff access
// (permissions, passwords, switching accounts on or off, removals), school status changes and deletions, plan
// publishing, setting changes, Principal resets, webhook re-runs and report downloads.
//
// Money columns:
//   - "Refunded" is the refund amount saved with the refund entry.
//   - "Offline payment" is the amount of the payment that was recorded (read from the payment itself).
//   Both are in paise in the API and shown as rupees. The totals add each column across ALL matching rows.
// The master admin's actions are visible to the master admin only (same rule as the Audit Log page).

const ACTION_KEYS = Object.keys(SENSITIVE_ACTIONS);
const REFUND_AMOUNT = jsonNumber("l.after_data->>'amountPaise'");

module.exports = {
  key: 'audit.sensitive_actions',
  area: 'audit',
  title: 'Sensitive actions',
  description: 'Refunds, offline payments, permission and password changes, status changes and deletions, with money and school where they apply.',
  usesDateRange: true,

  filters: [
    { key: 'category', label: 'Group', type: 'select', options: CATEGORIES.map((category) => ({ value: category, label: category })) },
    {
      key: 'action',
      label: 'Action',
      type: 'select',
      options: ACTION_KEYS.map((action) => ({ value: action, label: SENSITIVE_ACTIONS[action].label })),
    },
    { key: 'actor', label: 'Done by (name)', type: 'text' },
  ],

  columns: [
    { key: 'createdAt', label: 'When', type: 'datetime', width: 18 },
    { key: 'actorName', label: 'Done by', type: 'text', width: 22 },
    { key: 'category', label: 'Group', type: 'text', width: 14 },
    { key: 'actionLabel', label: 'Action', type: 'text', width: 32 },
    { key: 'school', label: 'School', type: 'text', width: 24 },
    { key: 'refundedPaise', label: 'Refunded', type: 'money', width: 14 },
    { key: 'offlinePaise', label: 'Offline payment', type: 'money', width: 16 },
    { key: 'reason', label: 'Reason', type: 'text', width: 24 },
    { key: 'description', label: 'Description', type: 'text', width: 60 },
    { key: 'ipAddress', label: 'IP address', type: 'text', width: 18 },
  ],

  async run({ range, filters, page, perPage, ctx }) {
    const wanted = filters.action ? [filters.action] : ACTION_KEYS.filter((action) => !filters.category || SENSITIVE_ACTIONS[action].category === filters.category);
    const where = ['l.created_at >= :from', 'l.created_at <= :to', 'l.action IN (:actions)'];
    const replacements = { from: range.fromDate, to: range.toDate, actions: wanted.length ? wanted : ['none'], limit: perPage, offset: (page - 1) * perPage };

    const hidden = visibleToViewer(ctx);
    if (hidden) where.push(hidden);
    if (filters.actor) {
      where.push('l.actor_name ILIKE :actor');
      replacements.actor = contains(filters.actor);
    }

    const from = `FROM audit_logs l
      LEFT JOIN clients c ON c.id = l.client_id
      LEFT JOIN payments p ON l.entity_type = 'payment' AND p.uuid = l.entity_uuid
      WHERE ${where.join(' AND ')}`;

    const refunded = `CASE WHEN l.action = 'payment.refunded' THEN ${REFUND_AMOUNT} END`;
    const offline = "CASE WHEN l.action = 'payment.recorded_offline' THEN p.amount_paise END";

    const [summary] = await sequelize.query(
      `SELECT COUNT(*)::int AS total, COALESCE(SUM(${refunded}), 0)::bigint AS refunded, COALESCE(SUM(${offline}), 0)::bigint AS offline ${from}`,
      { replacements, type: QueryTypes.SELECT },
    );

    const rows = await sequelize.query(
      `SELECT l.created_at AS "createdAt", l.actor_name AS "actorName", l.action, c.name AS school,
              ${refunded} AS "refundedPaise", ${offline} AS "offlinePaise",
              l.after_data->>'reason' AS reason, l.description, l.ip_address AS "ipAddress"
         ${from}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );

    return {
      rows: rows.map((row) => ({
        createdAt: row.createdAt,
        actorName: row.actorName || '',
        category: SENSITIVE_ACTIONS[row.action].category,
        actionLabel: SENSITIVE_ACTIONS[row.action].label,
        school: row.school || '',
        refundedPaise: row.refundedPaise === null ? null : Number(row.refundedPaise),
        offlinePaise: row.offlinePaise === null ? null : Number(row.offlinePaise),
        reason: row.action === 'payment.refunded' ? row.reason || '' : '',
        description: row.description || '',
        ipAddress: row.ipAddress || '',
      })),
      total: summary.total,
      totals: {
        actionLabel: 'Total',
        refundedPaise: Number(summary.refunded),
        offlinePaise: Number(summary.offline),
      },
    };
  },
};
