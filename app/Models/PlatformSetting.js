const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// One row per setting that was saved from the Admin app. A missing row means "use the default in config/settings.js".
module.exports = defineModel('PlatformSetting', 'platform_settings', {
  settingKey: DataTypes.STRING(100),
  settingValue: DataTypes.JSONB,
  settingGroup: DataTypes.STRING(40),
  description: DataTypes.STRING(300),
  updatedBy: DataTypes.BIGINT,
});
