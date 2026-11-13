const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// Which modules a plan includes.
module.exports = defineModel('PlanModule', 'plan_modules', {
  planId: { type: DataTypes.BIGINT, allowNull: false },
  moduleId: { type: DataTypes.BIGINT, allowNull: false },
  included: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Included, 0: Not included
});
