const { AdminPermission, AdminUserPermission } = require('@app/Models');
const { ADMIN_TYPE } = require('@app/Helpers/constants');

// The permission keys an admin holds. The master admin holds every permission, so the table is not consulted for them.
const keysFor = async (admin) => {
  if (Number(admin.type) === ADMIN_TYPE.MASTER) {
    const all = await AdminPermission.findAll({ attributes: ['permissionKey'], order: [['sortOrder', 'ASC']] });
    return all.map((p) => p.permissionKey);
  }

  const links = await AdminUserPermission.findAll({ where: { adminUserId: admin.id }, attributes: ['adminPermissionId'] });
  if (!links.length) return [];
  const rows = await AdminPermission.findAll({ where: { id: links.map((l) => l.adminPermissionId) }, attributes: ['permissionKey'], order: [['sortOrder', 'ASC']] });
  return rows.map((p) => p.permissionKey);
};

module.exports = { keysFor };
