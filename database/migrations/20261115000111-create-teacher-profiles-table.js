const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

// Work details of a teacher. The login itself (name, email, phone, status) lives in `users`; this is one row per
// teacher user with the extra HR fields shown on the teacher profile.
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('teacher_profiles', {
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
        allowNull: false,
        onDelete: 'CASCADE',
        comment: 'The school. Comes from the server, never from a request',
      }),
      user_id: foreignKey('users', {
        allowNull: false,
        onDelete: 'CASCADE',
        comment: 'The teacher login. One profile per user (checked in code)',
      }),
      designation: {
        type: DataTypes.STRING(60),
        comment: 'Shown under the name, for example Teacher or Assistant',
      },
      employee_code: {
        type: DataTypes.STRING(30),
      },
      qualification: {
        type: DataTypes.STRING(200),
      },
      experience_years: {
        type: DataTypes.DECIMAL(4, 1),
        comment: 'Years of experience when they joined or as entered',
      },
      joining_date: {
        type: DataTypes.DATEONLY,
      },
      date_of_birth: {
        type: DataTypes.DATEONLY,
      },
      gender: {
        type: DataTypes.SMALLINT,
        comment: '1: Female, 2: Male, 3: Other',
      },
      emergency_contact: {
        type: DataTypes.STRING(30),
      },
      address: {
        type: DataTypes.STRING(300),
      },
      shift_starts_at: {
        type: DataTypes.TIME,
      },
      shift_ends_at: {
        type: DataTypes.TIME,
      },
      annual_leave_quota: {
        type: DataTypes.SMALLINT,
        comment: 'Leave days allowed per academic year. Empty means not tracked',
      },
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, 'teacher_profiles', [
      'uuid',
      'client_id',
      'user_id',
      ['client_id', 'user_id'],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('teacher_profiles');
  },
};
