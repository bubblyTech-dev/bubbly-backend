const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// Every login attempt, successful or not. Append-only.
module.exports = defineModel(
  'AdminLoginHistory',
  'admin_login_history',
  {
    adminUserId: DataTypes.BIGINT,
    emailTried: DataTypes.STRING(190),
    method: DataTypes.SMALLINT, // 1: Password
    result: DataTypes.SMALLINT, // 1: Success, 2: Failed
    failureReason: DataTypes.SMALLINT, // 1: Wrong password, 2: Unknown email, 3: Inactive, 4: Locked
    ipAddress: DataTypes.STRING(64),
    userAgent: DataTypes.STRING(400),
  },
  { appendOnly: true },
);
