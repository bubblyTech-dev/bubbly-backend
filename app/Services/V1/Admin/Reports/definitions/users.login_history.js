const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const { LOGIN_RESULT, LOGIN_FAILURE } = require('@app/Helpers/constants');
const { contains, truncate, isMaster } = require('../support/common');

// Every sign-in attempt to the Admin app in the period, successful or not (the full history, newest first).
// Attempts for a master admin account are shown to a master admin only. An attempt with an unknown email has no
// account, so it is shown to everyone. The device column is the browser's description cut to 200 characters.

const RESULT_LABELS = { [LOGIN_RESULT.SUCCESS]: 'Success', [LOGIN_RESULT.FAILED]: 'Failed' };
const FAILURE_LABELS = {
  [LOGIN_FAILURE.WRONG_PASSWORD]: 'Wrong password',
  [LOGIN_FAILURE.UNKNOWN_EMAIL]: 'Unknown email',
  [LOGIN_FAILURE.INACTIVE]: 'Account inactive',
  [LOGIN_FAILURE.LOCKED]: 'Account locked',
};

const toOptions = (labels) => Object.entries(labels).map(([value, label]) => ({ value: Number(value), label }));

module.exports = {
  key: 'users.login_history',
  area: 'user-access',
  title: 'Login history',
  description: 'Every sign-in attempt in the period with its result, the address it came from and the device.',
  usesDateRange: true,

  filters: [
    { key: 'result', label: 'Result', type: 'select', options: toOptions(RESULT_LABELS) },
    { key: 'reason', label: 'Failure reason', type: 'select', options: toOptions(FAILURE_LABELS) },
    { key: 'staff', label: 'Staff (name or email)', type: 'text' },
  ],

  columns: [
    { key: 'createdAt', label: 'When', type: 'datetime', width: 18 },
    { key: 'emailTried', label: 'Email used', type: 'text', width: 30 },
    { key: 'staff', label: 'Staff member', type: 'text', width: 22 },
    { key: 'result', label: 'Result', type: 'text', width: 10 },
    { key: 'failureReason', label: 'Failure reason', type: 'text', width: 18 },
    { key: 'ipAddress', label: 'IP address', type: 'text', width: 18 },
    { key: 'device', label: 'Device', type: 'text', width: 44 },
  ],

  async run({ range, filters, page, perPage, ctx }) {
    const where = ['h.created_at >= :from', 'h.created_at <= :to'];
    const replacements = { from: range.fromDate, to: range.toDate, limit: perPage, offset: (page - 1) * perPage };

    if (!isMaster(ctx)) where.push('(u.id IS NULL OR u.type <> 1)');
    if (filters.result !== undefined) {
      where.push('h.result = :result');
      replacements.result = filters.result;
    }
    if (filters.reason !== undefined) {
      where.push('h.failure_reason = :reason');
      replacements.reason = filters.reason;
    }
    if (filters.staff) {
      where.push('(h.email_tried ILIKE :staff OR u.name ILIKE :staff OR u.email ILIKE :staff)');
      replacements.staff = contains(filters.staff);
    }

    const from = `FROM admin_login_history h LEFT JOIN admin_users u ON u.id = h.admin_user_id WHERE ${where.join(' AND ')}`;
    const [{ total }] = await sequelize.query(`SELECT COUNT(*)::int AS total ${from}`, { replacements, type: QueryTypes.SELECT });

    const rows = await sequelize.query(
      `SELECT h.created_at AS "createdAt", h.email_tried AS "emailTried", COALESCE(NULLIF(u.name, ''), u.email) AS staff,
              h.result, h.failure_reason AS "failureReason", h.ip_address AS "ipAddress", h.user_agent AS device
         ${from}
        ORDER BY h.created_at DESC, h.id DESC
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );

    return {
      rows: rows.map((row) => ({
        ...row,
        staff: row.staff || '',
        result: RESULT_LABELS[row.result] || '-',
        failureReason: row.failureReason ? FAILURE_LABELS[row.failureReason] || '-' : '',
        ipAddress: row.ipAddress || '',
        device: truncate(row.device, 200),
      })),
      total,
    };
  },
};
