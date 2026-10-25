const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('admin_sessions', {
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
      refresh_token_hash: {
        type: DataTypes.STRING(255),
        comment: 'Hash of the refresh token. The token itself is never stored',
      },
      ip_address: {
        type: DataTypes.STRING(64),
      },
      user_agent: {
        type: DataTypes.STRING(400),
      },
      device_label: {
        type: DataTypes.STRING(120),
        comment: 'For example Chrome on macOS',
      },
      expires_at: {
        type: DataTypes.DATE,
      },
      last_used_at: {
        type: DataTypes.DATE,
      },
      revoked_at: {
        type: DataTypes.DATE,
        comment: 'Set when logged out or revoked',
      },
      revoked_by: foreignKey('admin_users'),
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, 'admin_sessions', [
      'uuid',
      'admin_user_id',
      'refresh_token_hash',
      'expires_at',
      'revoked_by',
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('admin_sessions');
  },
};
