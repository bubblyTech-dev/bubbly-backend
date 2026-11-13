const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const { adminPermissions } = require('@config/permissions');
const optionSets = require('../optionSets');
const { contains, staffOnly } = require('../support/common');

// Who may do what: one row per staff member, one Yes / No column for EVERY permission, grouped by module in the same
// order as the permission checklist ("Schools · View schools"). The master admin holds every permission.
// The columns come from config/permissions.js, so a new permission appears here without any change to this file.
// On screen the table scrolls sideways inside its own box; an export has every column.
// Master admin accounts are shown to a master admin only. Removed accounts are left out.

const titleOf = (module) => module.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase()).replace('Users access', 'User & Access');

// "schools.view" -> "schools_view" (a safe row key)
const columnKey = (permissionKey) => permissionKey.replace(/[^a-z0-9]+/gi, '_');

const permissionColumns = adminPermissions.map((permission) => ({
  key: columnKey(permission.key),
  label: `${titleOf(permission.module)} · ${permission.name}`,
  type: 'text',
  width: 14,
}));

module.exports = {
  key: 'users.permission_matrix',
  area: 'user-access',
  title: 'Permission matrix',
  description: 'Every staff member against every permission (Yes or No), grouped by module.',
  usesDateRange: false,

  filters: [
    { key: 'status', label: 'Status', type: 'select', options: 'adminStatus' },
    { key: 'search', label: 'Search', type: 'text' },
  ],

  columns: [
    { key: 'name', label: 'Name', type: 'text', width: 24 },
    { key: 'email', label: 'Email', type: 'text', width: 30 },
    { key: 'type', label: 'Account type', type: 'text', width: 13 },
    { key: 'status', label: 'Status', type: 'text', width: 11 },
    { key: 'permissionCount', label: 'Permissions', type: 'integer', width: 12 },
    ...permissionColumns,
  ],

  async run({ filters, page, perPage, ctx }) {
    const where = [`u.deleted_at IS NULL${staffOnly(ctx, 'u.type')}`];
    const replacements = { limit: perPage, offset: (page - 1) * perPage };

    if (filters.status !== undefined) {
      where.push('u.status = :status');
      replacements.status = filters.status;
    }
    if (filters.search) {
      where.push('(u.name ILIKE :q OR u.email ILIKE :q)');
      replacements.q = contains(filters.search);
    }

    const from = `FROM admin_users u WHERE ${where.join(' AND ')}`;
    const [{ total }] = await sequelize.query(`SELECT COUNT(*)::int AS total ${from}`, { replacements, type: QueryTypes.SELECT });

    const staff = await sequelize.query(
      `SELECT u.id, u.name, u.email, u.type, u.status ${from} ORDER BY u.type ASC, u.created_at ASC, u.id ASC LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );

    // one query for the permissions of everyone on this page (no query per person)
    const granted = new Map();
    if (staff.length > 0) {
      const links = await sequelize.query(
        `SELECT up.admin_user_id AS "adminUserId", p.permission_key AS "permissionKey"
           FROM admin_user_permissions up
           JOIN admin_permissions p ON p.id = up.admin_permission_id
          WHERE up.admin_user_id IN (:ids)`,
        { replacements: { ids: staff.map((member) => member.id) }, type: QueryTypes.SELECT },
      );
      for (const link of links) {
        if (!granted.has(String(link.adminUserId))) granted.set(String(link.adminUserId), new Set());
        granted.get(String(link.adminUserId)).add(link.permissionKey);
      }
    }

    const rows = staff.map((member) => {
      const isMaster = Number(member.type) === 1;
      const has = granted.get(String(member.id)) || new Set();
      const row = {
        name: member.name || '',
        email: member.email,
        type: optionSets.label('adminType', member.type),
        status: optionSets.label('adminStatus', member.status),
        permissionCount: isMaster ? adminPermissions.length : adminPermissions.filter((permission) => has.has(permission.key)).length,
      };
      for (const permission of adminPermissions) {
        row[columnKey(permission.key)] = isMaster || has.has(permission.key) ? 'Yes' : 'No';
      }
      return row;
    });

    return { rows, total };
  },
};
