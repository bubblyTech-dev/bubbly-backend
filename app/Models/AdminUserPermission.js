const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// Which permission each staff member has been given.
module.exports = defineModel(
  'AdminUserPermission',
  'admin_user_permissions',
  {
    adminUserId: { type: DataTypes.BIGINT, allowNull: false },
    adminPermissionId: { type: DataTypes.BIGINT, allowNull: false },
    grantedBy: DataTypes.BIGINT,
  },
  { appendOnly: true },
);
