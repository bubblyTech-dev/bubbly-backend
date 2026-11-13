const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// A per-school limit override (see Services/V1/Common/Entitlements.js). limitValue empty = unlimited.
module.exports = defineModel('ClientLimit', 'client_limits', {
  clientId: { type: DataTypes.BIGINT, allowNull: false },
  limitKey: DataTypes.STRING(60),
  limitValue: DataTypes.BIGINT,
  subscriptionId: DataTypes.BIGINT,
  reason: DataTypes.TEXT,
  createdBy: DataTypes.BIGINT,
});
