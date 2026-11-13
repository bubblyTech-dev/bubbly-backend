const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// One line of text in a plan's feature list (shown on the pricing page). Features do not control access.
module.exports = defineModel('PlanFeature', 'plan_features', {
  planId: { type: DataTypes.BIGINT, allowNull: false },
  title: DataTypes.STRING(200),
  sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
});
