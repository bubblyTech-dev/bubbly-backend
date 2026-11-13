const { DataTypes } = require('sequelize');
const defineTenantModel = require('./TenantModel');

// Every login attempt of school users, successful or not. Append-only.
// A failed attempt with an unknown email has no school and is written inside context.runWithoutTenant.
module.exports = defineTenantModel(
  'UserLoginHistory',
  'user_login_history',
  {
    userId: DataTypes.BIGINT,
    emailTried: DataTypes.STRING(190),
    method: DataTypes.SMALLINT, // 1: Password, 2: Google
    result: DataTypes.SMALLINT, // 1: Success, 2: Failed
    failureReason: DataTypes.SMALLINT, // 1: Wrong password, 2: Unknown email, 3: Inactive, 4: Locked
    ipAddress: DataTypes.STRING(64),
    userAgent: DataTypes.STRING(400),
  },
  { appendOnly: true },
);
