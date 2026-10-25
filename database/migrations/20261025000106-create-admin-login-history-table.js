const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('admin_login_history', {
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
        comment: 'Empty when the email does not exist',
      }),
      email_tried: {
        type: DataTypes.STRING(190),
      },
      method: {
        type: DataTypes.SMALLINT,
        comment: '1: Password',
      },
      result: {
        type: DataTypes.SMALLINT,
        comment: '1: Success, 2: Failed',
      },
      failure_reason: {
        type: DataTypes.SMALLINT,
        comment: '1: Wrong password, 2: Unknown email, 3: Inactive, 4: Locked',
      },
      ip_address: {
        type: DataTypes.STRING(64),
      },
      user_agent: {
        type: DataTypes.STRING(400),
      },
      ...timestampColumns({ updatedAt: false }),
    });

    await addIndexes(queryInterface, 'admin_login_history', [
      'uuid',
      'admin_user_id',
      'email_tried',
      'result',
      ['admin_user_id', 'created_at'],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('admin_login_history');
  },
};
