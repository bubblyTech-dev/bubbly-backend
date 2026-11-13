const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('admin_users', {
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
      name: {
        type: DataTypes.STRING(150),
      },
      email: {
        type: DataTypes.STRING(190),
        allowNull: false,
        comment: 'Login email. The only required column. Uniqueness is checked in code',
      },
      password_hash: {
        type: DataTypes.STRING(255),
        comment: 'Empty until a password is set',
      },
      phone: {
        type: DataTypes.STRING(30),
      },
      profile_image: {
        type: DataTypes.STRING(120),
        comment: 'File name only (date and time + random). The folder comes from config/files.js',
      },
      type: {
        type: DataTypes.SMALLINT,
        defaultValue: 2,
        comment: '1: Master, 2: Staff',
      },
      status: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: '1: Active, 2: Inactive, 3: Locked',
      },
      must_change_password: {
        type: DataTypes.SMALLINT,
        defaultValue: 0,
        comment: '1: Yes, 0: No',
      },
      failed_login_count: {
        type: DataTypes.SMALLINT,
        defaultValue: 0,
        comment: 'Consecutive failed logins, reset on success',
      },
      locked_until: {
        type: DataTypes.DATE,
        comment: 'Temporary lock after too many failures',
      },
      last_login_at: {
        type: DataTypes.DATE,
      },
      password_changed_at: {
        type: DataTypes.DATE,
      },
      created_by: foreignKey('admin_users', {
        comment: 'Who created this account',
      }),
      ...timestampColumns({ deletedAt: true }),
    });

    await addIndexes(queryInterface, 'admin_users', [
      'uuid',
      'email',
      'type',
      'status',
      'created_by',
      'deleted_at',
      ['type', 'status'],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('admin_users');
  },
};
