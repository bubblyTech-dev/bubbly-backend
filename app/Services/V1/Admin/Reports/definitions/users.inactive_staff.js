const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const optionSets = require('../optionSets');
const { staffOnly } = require('../support/common');

// Active staff accounts that have not signed in for a while (or never did): a clean-up list.
// An account qualifies when its last login is more than N x 24 hours ago, or it never signed in. Only accounts that are
// still Active are listed (an Inactive or Locked account needs no clean-up). With no choice made the report uses 30 days.
// Master admin accounts are shown to a master admin only; removed accounts are left out.

const DAYS_OPTIONS = [7, 14, 30, 60, 90, 180, 365];
const DEFAULT_DAYS = 30;

module.exports = {
  key: 'users.inactive_staff',
  area: 'user-access',
  title: 'Inactive staff',
  description: 'Active accounts with no login for the chosen number of days, longest inactive first.',
  usesDateRange: false,

  filters: [
    {
      key: 'days',
      label: 'No login for',
      type: 'select',
      options: DAYS_OPTIONS.map((days) => ({ value: days, label: `${days} days` })),
    },
  ],

  columns: [
    { key: 'name', label: 'Name', type: 'text', width: 24 },
    { key: 'email', label: 'Email', type: 'text', width: 30 },
    { key: 'type', label: 'Account type', type: 'text', width: 13 },
    { key: 'lastLoginAt', label: 'Last login', type: 'datetime', width: 18 },
    { key: 'daysSinceLogin', label: 'Days since login', type: 'integer', width: 14 },
    { key: 'createdAt', label: 'Added', type: 'datetime', width: 18 },
  ],

  async run({ filters, page, perPage, ctx }) {
    const days = filters.days !== undefined ? Number(filters.days) : DEFAULT_DAYS;
    const where = [
      'u.deleted_at IS NULL',
      `u.status = 1${staffOnly(ctx, 'u.type')}`,
      "(u.last_login_at IS NULL OR u.last_login_at < NOW() - (:days * INTERVAL '1 day'))",
    ];
    const replacements = { days, limit: perPage, offset: (page - 1) * perPage };

    const from = `FROM admin_users u WHERE ${where.join(' AND ')}`;
    const [{ total }] = await sequelize.query(`SELECT COUNT(*)::int AS total ${from}`, { replacements, type: QueryTypes.SELECT });

    const rows = await sequelize.query(
      `SELECT u.name, u.email, u.type, u.last_login_at AS "lastLoginAt",
              CASE WHEN u.last_login_at IS NULL THEN NULL
                   ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - u.last_login_at)) / 86400)::int END AS "daysSinceLogin",
              u.created_at AS "createdAt"
         ${from}
        ORDER BY u.last_login_at ASC NULLS FIRST, u.id ASC
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );

    return {
      rows: rows.map((row) => ({ ...row, name: row.name || '', type: optionSets.label('adminType', row.type) })),
      total,
    };
  },
};
