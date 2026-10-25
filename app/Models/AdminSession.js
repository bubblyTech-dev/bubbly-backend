const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// One row per signed-in device. Holds the hash of the refresh token, never the token itself.
module.exports = defineModel('AdminSession', 'admin_sessions', {
  adminUserId: { type: DataTypes.BIGINT, allowNull: false },
  refreshTokenHash: DataTypes.STRING(255),
  ipAddress: DataTypes.STRING(64),
  userAgent: DataTypes.STRING(400),
  deviceLabel: DataTypes.STRING(120),
  expiresAt: DataTypes.DATE,
  lastUsedAt: DataTypes.DATE,
  revokedAt: DataTypes.DATE,
  revokedBy: DataTypes.BIGINT,
});
