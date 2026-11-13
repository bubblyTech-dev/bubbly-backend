const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

module.exports = defineModel('AdminPasswordReset', 'admin_password_resets', {
  adminUserId: { type: DataTypes.BIGINT, allowNull: false },
  tokenHash: DataTypes.STRING(255),
  expiresAt: DataTypes.DATE,
  usedAt: DataTypes.DATE,
  requestedIp: DataTypes.STRING(64),
});
