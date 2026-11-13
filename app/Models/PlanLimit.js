const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// One limit of a plan, for example max_students = 100. An empty value means unlimited.
module.exports = defineModel('PlanLimit', 'plan_limits', {
  planId: { type: DataTypes.BIGINT, allowNull: false },
  limitKey: DataTypes.STRING(60),
  limitValue: DataTypes.BIGINT,
});
