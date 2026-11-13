const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const optionSets = require('../optionSets');
const { contains, staffOnly, yesNo } = require('../support/common');

// Everyone who can sign in to the Admin app. It ignores the date range: it is the list "as of now".
// Master admin accounts are shown to a master admin only; every other viewer sees the staff accounts.
// Removed (deleted) accounts are left out. The master always holds every permission, so its count is the full list.

module.exports = {
  key: 'users.staff_directory',
  area: 'user-access',
  title: 'Staff directory',
  description: 'Every staff account with its status, last login, permissions and signed-in devices.',
  usesDateRange: false,

  filters: [
    { key: 'status', label: 'Status', type: 'select', options: 'adminStatus' },
    { key: 'type', label: 'Account type', type: 'select', options: 'adminType' },
    { key: 'search', label: 'Search', type: 'text' },
  ],

  columns: [
    { key: 'name', label: 'Name', type: 'text', width: 24 },
    { key: 'email', label: 'Email', type: 'text', width: 30 },
    { key: 'phone', label: 'Phone', type: 'text', width: 16 },
    { key: 'type', label: 'Account type', type: 'text', width: 13 },
    { key: 'status', label: 'Status', type: 'text', width: 11 },
    { key: 'lastLoginAt', label: 'Last login', type: 'datetime', width: 18 },
    { key: 'mustChangePassword', label: 'Must change password', type: 'text', width: 14 },
    { key: 'permissions', label: 'Permissions', type: 'integer', width: 12 },
    { key: 'activeSessions', label: 'Signed-in devices', type: 'integer', width: 14 },
    { key: 'createdBy', label: 'Added by', type: 'text', width: 20 },
    { key: 'createdAt', label: 'Added', type: 'datetime', width: 18 },
  ],

  async run({ filters, page, perPage, ctx }) {
    const where = [`u.deleted_at IS NULL${staffOnly(ctx, 'u.type')}`];
    const replacements = { limit: perPage, offset: (page - 1) * perPage };

    if (filters.status !== undefined) {
      where.push('u.status = :status');
      replacements.status = filters.status;
    }
    if (filters.type !== undefined) {
      where.push('u.type = :type');
      replacements.type = filters.type;
    }
    if (filters.search) {
      where.push('(u.name ILIKE :q OR u.email ILIKE :q OR u.phone ILIKE :q)');
      replacements.q = contains(filters.search);
    }

    const from = `FROM admin_users u LEFT JOIN admin_users c ON c.id = u.created_by WHERE ${where.join(' AND ')}`;
    const [{ total }] = await sequelize.query(`SELECT COUNT(*)::int AS total ${from}`, { replacements, type: QueryTypes.SELECT });

    const rows = await sequelize.query(
      `SELECT u.name, u.email, u.phone, u.type, u.status, u.last_login_at AS "lastLoginAt", u.must_change_password AS "mustChangePassword",
              CASE WHEN u.type = 1 THEN (SELECT COUNT(*)::int FROM admin_permissions)
                   ELSE (SELECT COUNT(*)::int FROM admin_user_permissions up WHERE up.admin_user_id = u.id) END AS permissions,
              (SELECT COUNT(*)::int FROM admin_sessions s WHERE s.admin_user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > NOW()) AS "activeSessions",
              COALESCE(NULLIF(c.name, ''), c.email) AS "createdBy", u.created_at AS "createdAt"
         ${from}
        ORDER BY u.type ASC, u.created_at ASC, u.id ASC
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );

    return {
      rows: rows.map((row) => ({
        ...row,
        type: optionSets.label('adminType', row.type),
        status: optionSets.label('adminStatus', row.status),
        mustChangePassword: yesNo(row.mustChangePassword),
        createdBy: row.createdBy || '',
      })),
      total,
    };
  },
};
