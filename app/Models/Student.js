const { DataTypes } = require('sequelize');
const defineTenantModel = require('./TenantModel');

// A child enrolled in the school. userId is the parent app login (a User with role Student), empty until created.
module.exports = defineTenantModel(
  'Student',
  'students',
  {
    classId: DataTypes.BIGINT,
    userId: DataTypes.BIGINT,
    admissionNo: DataTypes.STRING(40),
    name: { type: DataTypes.STRING(150), allowNull: false },
    dateOfBirth: DataTypes.DATEONLY,
    gender: DataTypes.SMALLINT, // 1: Female, 2: Male, 3: Other
    bloodGroup: DataTypes.STRING(5),
    address: DataTypes.STRING(300),
    medicalNotes: DataTypes.TEXT,
    guardianName: DataTypes.STRING(150),
    guardianRelation: DataTypes.STRING(30),
    guardianPhone: DataTypes.STRING(30),
    guardianEmail: DataTypes.STRING(190),
    secondGuardianName: DataTypes.STRING(150),
    secondGuardianPhone: DataTypes.STRING(30),
    admissionDate: DataTypes.DATEONLY,
    photo: DataTypes.STRING(120), // file name only; the folder comes from config/files.js
    status: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Active, 2: Inactive, 3: Left
    createdBy: DataTypes.BIGINT,
  },
  { paranoid: true },
);
