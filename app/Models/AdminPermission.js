const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// Everything an admin can be allowed to do. Synced from config/permissions.js by the seeder.
module.exports = defineModel('AdminPermission', 'admin_permissions', {
  permissionKey: DataTypes.STRING(100),
  name: DataTypes.STRING(150),
  module: DataTypes.STRING(60),
  description: DataTypes.STRING(300),
  sortOrder: DataTypes.INTEGER,
});
