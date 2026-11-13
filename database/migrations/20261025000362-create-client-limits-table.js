const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

// A per-school limit override set by Bubbly staff (for example max_students). One row per school and limit at a
// time (kept in code, not by a unique index).
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('client_limits', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false, comment: 'Internal key, used for joins only' },
      uuid: {
        type: DataTypes.UUID,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        comment: 'Public id, the only id the API uses',
      },
      client_id: foreignKey('clients', { allowNull: false, onDelete: 'CASCADE' }),
      limit_key: { type: DataTypes.STRING(60), comment: 'Same keys as plan_limits.limit_key, for example max_students' },
      limit_value: { type: DataTypes.BIGINT, comment: 'The school limit. Empty means unlimited' },
      subscription_id: foreignKey('subscriptions', {
        comment: 'The subscription the override was created under. It applies only while this is the school current subscription. Empty means the school had none, it lasts until removed',
      }),
      reason: { type: DataTypes.TEXT, comment: 'Why staff made the change' },
      created_by: foreignKey('admin_users', { comment: 'Staff member who set it' }),
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, 'client_limits', ['uuid', 'client_id', 'limit_key', 'subscription_id', 'created_by', ['client_id', 'limit_key']]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('client_limits');
  },
};
