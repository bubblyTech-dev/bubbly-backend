const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// Bubbly staff who use the Admin app. No client_id: they belong to the platform, not to a school.
module.exports = defineModel(
  'AdminUser',
  'admin_users',
  {
    name: DataTypes.STRING(150),
    email: { type: DataTypes.STRING(190), allowNull: false },
    passwordHash: DataTypes.STRING(255),
    phone: DataTypes.STRING(30),
    profileImage: DataTypes.STRING(120), // file name only; the folder comes from config/files.js
    type: { type: DataTypes.SMALLINT, defaultValue: 2 }, // 1: Master, 2: Staff
    status: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Active, 2: Inactive, 3: Locked
    mustChangePassword: { type: DataTypes.SMALLINT, defaultValue: 0 }, // 1: Yes, 0: No
    failedLoginCount: { type: DataTypes.SMALLINT, defaultValue: 0 },
    lockedUntil: DataTypes.DATE,
    lastLoginAt: DataTypes.DATE,
    passwordChangedAt: DataTypes.DATE,
    lastSeenNotificationsAt: DataTypes.DATE, // the notification bell counts items newer than this
    createdBy: DataTypes.BIGINT,
  },
  { paranoid: true },
);
