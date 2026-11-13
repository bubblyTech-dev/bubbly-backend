const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('admin_user_permissions', {
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
      admin_user_id: foreignKey('admin_users', {
        allowNull: false,
        onDelete: 'CASCADE',
      }),
      admin_permission_id: foreignKey('admin_permissions', {
        allowNull: false,
        onDelete: 'CASCADE',
      }),
      granted_by: foreignKey('admin_users', {
        comment: 'Who ticked the box',
      }),
      ...timestampColumns({ updatedAt: false }),
    });

    await addIndexes(queryInterface, 'admin_user_permissions', [
      'uuid',
      'admin_user_id',
      'admin_permission_id',
      'granted_by',
      ['admin_user_id', 'admin_permission_id'],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('admin_user_permissions');
  },
};
