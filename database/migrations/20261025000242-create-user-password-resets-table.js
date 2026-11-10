const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

// Password reset and first-password (welcome) links of school users. Only the hash of the token is stored.
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('user_password_resets', {
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
      token_hash: {
        type: DataTypes.STRING(255),
        comment: 'Hash of the link token. The token is only in the email',
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

    await addIndexes(queryInterface, 'user_password_resets', [
      'uuid',
      'client_id',
      'user_id',
      'token_hash',
      'expires_at',
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_password_resets');
  },
};
