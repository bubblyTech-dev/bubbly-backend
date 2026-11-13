const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// A feature a school can use (attendance, fees ...). Plans choose which modules they include.
// Named AppModule because "Module" is a Node.js word.
module.exports = defineModel('AppModule', 'modules', {
  moduleKey: DataTypes.STRING(60),
  name: DataTypes.STRING(120),
  description: DataTypes.STRING(300),
  sortOrder: DataTypes.INTEGER,
  status: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Active, 2: Inactive
  isCore: { type: DataTypes.SMALLINT, defaultValue: 0 }, // 1: Yes, 0: No
});
