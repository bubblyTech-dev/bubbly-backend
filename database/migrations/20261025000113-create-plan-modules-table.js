const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('plan_modules', {
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
      module_id: foreignKey('modules', {
        allowNull: false,
        onDelete: 'CASCADE',
      }),
      included: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: '1: Included in the plan, 0: Not included',
      },
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, 'plan_modules', ['uuid', 'plan_id', 'module_id', ['plan_id', 'module_id']]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('plan_modules');
  },
};
