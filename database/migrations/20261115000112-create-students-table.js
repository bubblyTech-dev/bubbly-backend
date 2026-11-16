const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

// A child enrolled in the school. A student record exists without any login. The parent app signs in with a Student
// login (users.role 3) that is linked here through user_id; its email is the guardian's email.
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('students', {
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
      class_id: foreignKey('classes', {
        comment: 'Current class. Empty means not placed yet',
      }),
      user_id: foreignKey('users', {
        comment: 'The parent app login (role Student). Empty until a login is created',
      }),
      admission_no: {
        type: DataTypes.STRING(40),
      },
      name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      date_of_birth: {
        type: DataTypes.DATEONLY,
      },
      gender: {
        type: DataTypes.SMALLINT,
        comment: '1: Female, 2: Male, 3: Other',
      },
      blood_group: {
        type: DataTypes.STRING(5),
      },
      address: {
        type: DataTypes.STRING(300),
      },
      medical_notes: {
        type: DataTypes.TEXT,
        comment: 'Allergies or anything the teacher must know',
      },
      guardian_name: {
        type: DataTypes.STRING(150),
      },
      guardian_relation: {
        type: DataTypes.STRING(30),
        comment: 'For example Mother, Father, Guardian',
      },
      guardian_phone: {
        type: DataTypes.STRING(30),
      },
      guardian_email: {
        type: DataTypes.STRING(190),
      },
      second_guardian_name: {
        type: DataTypes.STRING(150),
      },
      second_guardian_phone: {
        type: DataTypes.STRING(30),
      },
      admission_date: {
        type: DataTypes.DATEONLY,
      },
      photo: {
        type: DataTypes.STRING(120),
        comment: 'File name only. The folder comes from config/files.js',
      },
      status: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: '1: Active, 2: Inactive, 3: Left',
      },
      created_by: {
        type: DataTypes.BIGINT,
        comment: 'The user who added the student. Plain number, no foreign key',
      },
      ...timestampColumns({ deletedAt: true }),
    });

    await addIndexes(queryInterface, 'students', [
      'uuid',
      'client_id',
      'class_id',
      'user_id',
      'deleted_at',
      ['client_id', 'status'],
      ['client_id', 'class_id'],
      ['client_id', 'name'],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('students');
  },
};
