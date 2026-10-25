const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, addIndexes } = require('../helpers');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('modules', {
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
      module_key: {
        type: DataTypes.STRING(60),
        comment: 'Fixed code name used by the backend, for example attendance',
      },
      name: {
        type: DataTypes.STRING(120),
        comment: 'Label shown in the apps',
      },
      description: {
        type: DataTypes.STRING(300),
      },
      sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      status: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: '1: Active, 2: Inactive',
      },
      is_core: {
        type: DataTypes.SMALLINT,
        defaultValue: 0,
        comment: '1: Yes (part of every plan, cannot be switched off), 0: No',
      },
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, 'modules', ['uuid', 'module_key', 'status', 'sort_order']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('modules');
  },
};
