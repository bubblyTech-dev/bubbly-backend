const { DataTypes } = require('sequelize');
const defineTenantModel = require('./TenantModel');

// One row per signed-in device of a school user. Holds the hash of the refresh token, never the token itself.
module.exports = defineTenantModel('UserSession', 'user_sessions', {
  userId: { type: DataTypes.BIGINT, allowNull: false },
  refreshTokenHash: DataTypes.STRING(255),
  ipAddress: DataTypes.STRING(64),
  userAgent: DataTypes.STRING(400),
  deviceLabel: DataTypes.STRING(120),
  expiresAt: DataTypes.DATE,
  lastUsedAt: DataTypes.DATE,
  revokedAt: DataTypes.DATE,
  revokedBy: DataTypes.BIGINT,
});
