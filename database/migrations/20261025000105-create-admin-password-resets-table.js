const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('admin_password_resets', {
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
      token_hash: {
        type: DataTypes.STRING(255),
        comment: 'Hash of the reset token. The token is only in the email',
      },
      expires_at: {
        type: DataTypes.DATE,
      },
      used_at: {
        type: DataTypes.DATE,
      },
      requested_ip: {
        type: DataTypes.STRING(64),
      },
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, 'admin_password_resets', [
      'uuid',
      'admin_user_id',
      'token_hash',
      'expires_at',
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('admin_password_resets');
  },
};
