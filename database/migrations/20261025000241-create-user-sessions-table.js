const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

// One row per signed-in device of a school user. Holds the hash of the refresh token, never the token itself.
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('user_sessions', {
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
      client_id: foreignKey('clients', {
        onDelete: 'CASCADE',
      }),
      user_id: foreignKey('users', {
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
      revoked_by: {
        type: DataTypes.BIGINT,
        comment: 'The user who ended this session. Plain number, no foreign key',
      },
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, 'user_sessions', [
      'uuid',
      'client_id',
      'user_id',
      'refresh_token_hash',
      'expires_at',
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_sessions');
  },
};
