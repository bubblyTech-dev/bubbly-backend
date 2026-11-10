const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('plan_features', {
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
      title: {
        type: DataTypes.STRING(200),
        comment: 'One line shown on the pricing page, for example Unlimited attendance records',
      },
      sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'Position in the plan list, lowest first',
      },
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, 'plan_features', ['uuid', 'plan_id', ['plan_id', 'sort_order']]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('plan_features');
  },
};
