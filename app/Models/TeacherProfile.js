const { DataTypes } = require('sequelize');
const defineTenantModel = require('./TenantModel');

// Work details of a teacher (one row per teacher user). The login itself is the User row.
module.exports = defineTenantModel('TeacherProfile', 'teacher_profiles', {
  userId: { type: DataTypes.BIGINT, allowNull: false },
  designation: DataTypes.STRING(60),
  employeeCode: DataTypes.STRING(30),
  qualification: DataTypes.STRING(200),
  experienceYears: DataTypes.DECIMAL(4, 1),
  joiningDate: DataTypes.DATEONLY,
  dateOfBirth: DataTypes.DATEONLY,
  gender: DataTypes.SMALLINT, // 1: Female, 2: Male, 3: Other
  emergencyContact: DataTypes.STRING(30),
  address: DataTypes.STRING(300),
  shiftStartsAt: DataTypes.TIME,
  shiftEndsAt: DataTypes.TIME,
  annualLeaveQuota: DataTypes.SMALLINT,
});
