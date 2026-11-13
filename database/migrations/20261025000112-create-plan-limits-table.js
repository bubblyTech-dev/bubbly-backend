const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('plan_limits', {
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
      plan_id: foreignKey('plans', {
        allowNull: false,
        onDelete: 'CASCADE',
      }),
      limit_key: {
        type: DataTypes.STRING(60),
        comment: 'For example max_students. The list of keys is in config/plans.js',
      },
      limit_value: {
        type: DataTypes.BIGINT,
        comment: 'Empty means unlimited',
      },
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, 'plan_limits', ['uuid', 'plan_id', 'limit_key', ['plan_id', 'limit_key']]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('plan_limits');
  },
};
