const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const { contains, staffOnly } = require('../support/common');

// Devices that are signed in to the Admin app right now: sessions that were not ended and have not expired.
// It ignores the date range ("as of now"). The refresh token itself (or its hash) is never part of this report.
// Sessions of a master admin are shown to a master admin only; removed accounts are left out.

module.exports = {
  key: 'users.active_sessions',
  area: 'user-access',
  title: 'Active sessions',
  description: 'Every device that is signed in right now, with the address it came from and when it was last used.',
  usesDateRange: false,

  filters: [{ key: 'search', label: 'Staff (name or email)', type: 'text' }],

  columns: [
    { key: 'name', label: 'Name', type: 'text', width: 24 },
    { key: 'email', label: 'Email', type: 'text', width: 30 },
    { key: 'device', label: 'Device', type: 'text', width: 26 },
    { key: 'ipAddress', label: 'IP address', type: 'text', width: 18 },
    { key: 'startedAt', label: 'Signed in', type: 'datetime', width: 18 },
    { key: 'lastUsedAt', label: 'Last used', type: 'datetime', width: 18 },
    { key: 'expiresAt', label: 'Expires', type: 'datetime', width: 18 },
  ],

  async run({ filters, page, perPage, ctx }) {
    const where = ['s.revoked_at IS NULL', 's.expires_at > NOW()', `u.deleted_at IS NULL${staffOnly(ctx, 'u.type')}`];
    const replacements = { limit: perPage, offset: (page - 1) * perPage };

    if (filters.search) {
      where.push('(u.name ILIKE :q OR u.email ILIKE :q)');
      replacements.q = contains(filters.search);
    }

    const from = `FROM admin_sessions s JOIN admin_users u ON u.id = s.admin_user_id WHERE ${where.join(' AND ')}`;
    const [{ total }] = await sequelize.query(`SELECT COUNT(*)::int AS total ${from}`, { replacements, type: QueryTypes.SELECT });

    const rows = await sequelize.query(
      `SELECT u.name, u.email, s.device_label AS device, s.ip_address AS "ipAddress",
              s.created_at AS "startedAt", s.last_used_at AS "lastUsedAt", s.expires_at AS "expiresAt"
         ${from}
        ORDER BY s.last_used_at DESC NULLS LAST, s.id DESC
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );

    return {
      rows: rows.map((row) => ({ ...row, name: row.name || '', device: row.device || '', ipAddress: row.ipAddress || '' })),
      total,
    };
  },
};
