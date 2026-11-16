const { DataTypes } = require('sequelize');
const defineTenantModel = require('./TenantModel');

// A class (group) of a school, for example Playgroup or Nursery A. Named SchoolClass because `Class` is a keyword.
module.exports = defineTenantModel(
  'SchoolClass',
  'classes',
  {
    name: { type: DataTypes.STRING(100), allowNull: false },
    code: DataTypes.STRING(30),
    room: DataTypes.STRING(60),
    startsAt: DataTypes.TIME,
    endsAt: DataTypes.TIME,
    capacity: DataTypes.INTEGER,
    classTeacherId: DataTypes.BIGINT,
    status: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Active, 2: Archived
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
    createdBy: DataTypes.BIGINT,
  },
  { paranoid: true },
);
