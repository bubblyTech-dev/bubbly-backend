const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// One line of text in a plan's feature list (shown on the pricing page). A feature may link to a module (moduleId); the plan's plan_modules are rebuilt from those links.
module.exports = defineModel('PlanFeature', 'plan_features', {
  planId: { type: DataTypes.BIGINT, allowNull: false },
  title: DataTypes.STRING(200),
  moduleId: DataTypes.BIGINT, // optional modules.id this line unlocks
  sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
});
