const { DataTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');

// Every model gets the same two keys: `id` (internal, used for joins) and `uuid` (public, the only id the API exposes).
// Columns are camelCase in code and snake_case in the database (underscored: true).
//
//   defineModel('AdminUser', 'admin_users', { name: {...} }, { paranoid: true })   -> soft delete (deleted_at)
//   defineModel('AdminLoginHistory', 'admin_login_history', {...}, { appendOnly: true }) -> no updated_at
//
// School-scoped models (with client_id) will get their client scope here later.
const defineModel = (name, tableName, attributes, { appendOnly = false, paranoid = false } = {}) =>
  sequelize.define(
    name,
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      uuid: { type: DataTypes.UUID, allowNull: false, defaultValue: DataTypes.UUIDV4 },
      ...attributes,
    },
    {
      tableName,
      underscored: true,
      timestamps: true,
      updatedAt: !appendOnly,
      paranoid,
    },
  );

module.exports = defineModel;
