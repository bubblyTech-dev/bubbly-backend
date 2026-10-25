const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('platform_settings', {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: 'Internal key, used for joins only',
      },
      uuid: {
        type: DataTypes.UUID,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        comment: 'Public id, the only id the API uses',
      },
      setting_key: {
        type: DataTypes.STRING(100),
        comment: 'For example policy.grace_days. Uniqueness is checked in code',
      },
      setting_value: {
        type: DataTypes.JSONB,
        comment: 'The value as JSON: text, number, true/false or a list',
      },
      setting_group: {
        type: DataTypes.STRING(40),
        comment: 'general, billing, policy, renewals, email',
      },
      description: {
        type: DataTypes.STRING(300),
      },
      updated_by: foreignKey('admin_users', {
        comment: 'Who changed it last',
      }),
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, 'platform_settings', [
      'uuid',
      'setting_key',
      'setting_group',
      'updated_by',
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('platform_settings');
  },
};
