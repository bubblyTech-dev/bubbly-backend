const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// Internal notes about a school, written by Bubbly staff.
module.exports = defineModel(
  'ClientNote',
  'client_notes',
  {
    clientId: { type: DataTypes.BIGINT, allowNull: false },
    note: DataTypes.TEXT,
    createdBy: DataTypes.BIGINT,
  },
  { paranoid: true },
);
