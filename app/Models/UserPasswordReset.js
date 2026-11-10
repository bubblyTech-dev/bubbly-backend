const { DataTypes } = require('sequelize');
const defineTenantModel = require('./TenantModel');

// A reset or welcome link of a school user. Only the hash of the token is stored.
module.exports = defineTenantModel('UserPasswordReset', 'user_password_resets', {
  userId: { type: DataTypes.BIGINT, allowNull: false },
  tokenHash: DataTypes.STRING(255),
  expiresAt: DataTypes.DATE,
  usedAt: DataTypes.DATE,
  requestedIp: DataTypes.STRING(64),
});
