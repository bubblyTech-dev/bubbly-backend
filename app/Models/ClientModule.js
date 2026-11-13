const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// A per-school module override (see Services/V1/Common/Entitlements.js). Set only by Bubbly staff, so it is a plain
// model like ClientNote; school users never read it directly.
module.exports = defineModel('ClientModule', 'client_modules', {
  clientId: { type: DataTypes.BIGINT, allowNull: false },
  moduleId: { type: DataTypes.BIGINT, allowNull: false },
  access: { type: DataTypes.SMALLINT, allowNull: false }, // 1: Grant, 2: Revoke
  subscriptionId: DataTypes.BIGINT, // the subscription it was created under (empty: the school had none)
  reason: DataTypes.TEXT,
  createdBy: DataTypes.BIGINT,
});
