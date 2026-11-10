const { DataTypes } = require('sequelize');
const defineTenantModel = require('./TenantModel');

// A person who uses a school's workspace. Always belongs to one school (clientId).
// Lookups that start without a school (login by email, refresh tokens) run inside context.runWithoutTenant.
module.exports = defineTenantModel(
  'User',
  'users',
  {
    email: { type: DataTypes.STRING(190), allowNull: false },
    name: DataTypes.STRING(150),
    phone: DataTypes.STRING(30),
    passwordHash: DataTypes.STRING(255),
    role: DataTypes.SMALLINT, // 1: Principal, 2: Teacher, 3: Student
    status: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Active, 2: Inactive, 3: Locked
    mustChangePassword: { type: DataTypes.SMALLINT, defaultValue: 0 }, // 1: Yes, 0: No
    failedLoginCount: { type: DataTypes.SMALLINT, defaultValue: 0 },
    lockedUntil: DataTypes.DATE,
    lastLoginAt: DataTypes.DATE,
    passwordChangedAt: DataTypes.DATE,
    firebaseUid: DataTypes.STRING(128), // reserved for Google sign-in
    profileImage: DataTypes.STRING(120), // file name only; the folder comes from config/files.js
    createdBy: DataTypes.BIGINT,
  },
  { paranoid: true },
);
