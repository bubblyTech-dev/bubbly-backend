const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

// A per-school module override set by Bubbly staff: switch a module ON although the plan does not include it, or
// OFF although it does. One row per school and module at a time (kept in code, not by a unique index).
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('client_modules', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false, comment: 'Internal key, used for joins only' },
      uuid: {
        type: DataTypes.UUID,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        comment: 'Public id, the only id the API uses',
      },
      client_id: foreignKey('clients', { allowNull: false, onDelete: 'CASCADE' }),
      module_id: foreignKey('modules', { allowNull: false, onDelete: 'CASCADE' }),
      access: { type: DataTypes.SMALLINT, allowNull: false, comment: '1: Grant (on although the plan lacks it), 2: Revoke (off although the plan has it)' },
      subscription_id: foreignKey('subscriptions', {
        comment: 'The subscription the override was created under. It applies only while this is the school current subscription. Empty means the school had none, it lasts until removed',
      }),
      reason: { type: DataTypes.TEXT, comment: 'Why staff made the change' },
      created_by: foreignKey('admin_users', { comment: 'Staff member who set it' }),
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, 'client_modules', ['uuid', 'client_id', 'module_id', 'subscription_id', 'created_by', ['client_id', 'module_id']]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('client_modules');
  },
};
