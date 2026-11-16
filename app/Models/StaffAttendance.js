const { DataTypes } = require('sequelize');
const defineTenantModel = require('./TenantModel');

// Daily attendance of a staff member. One row per person per day (kept in code).
module.exports = defineTenantModel('StaffAttendance', 'staff_attendance', {
  userId: { type: DataTypes.BIGINT, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.SMALLINT, allowNull: false }, // 1: Present, 2: Absent, 3: Late, 4: On leave, 5: Half day
  note: DataTypes.STRING(200),
  markedBy: DataTypes.BIGINT,
});
