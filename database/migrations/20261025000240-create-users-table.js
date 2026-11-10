const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

// The people who use a school's workspace (Principal, Teacher, Student). Every row belongs to one school (client_id).
// The email is the login and is unique across ALL schools; uniqueness is checked in code, not in the database.
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('users', {
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
        comment: 'The school this person belongs to. Comes from the server, never from a request',
      }),
      email: {
        type: DataTypes.STRING(190),
        allowNull: false,
        comment: 'Login email. The only required column. Uniqueness across all schools is checked in code',
      },
      name: {
        type: DataTypes.STRING(150),
      },
      phone: {
        type: DataTypes.STRING(30),
      },
      password_hash: {
        type: DataTypes.STRING(255),
        comment: 'Empty until the person sets a password from the welcome link',
      },
      role: {
        type: DataTypes.SMALLINT,
        comment: '1: Principal, 2: Teacher, 3: Student',
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
      firebase_uid: {
        type: DataTypes.STRING(128),
        comment: 'Reserved for Google sign-in through Firebase. Not used yet',
      },
      profile_image: {
        type: DataTypes.STRING(120),
        comment: 'File name only. The folder comes from config/files.js',
      },
      created_by: {
        type: DataTypes.BIGINT,
        comment: 'The user or admin who added this person. Plain number, no foreign key',
      },
      ...timestampColumns({ deletedAt: true }),
    });

    await addIndexes(queryInterface, 'users', [
      'uuid',
      'client_id',
      'email',
      'role',
      'status',
      'firebase_uid',
      'deleted_at',
      ['client_id', 'role'],
      ['client_id', 'status'],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
  },
};
