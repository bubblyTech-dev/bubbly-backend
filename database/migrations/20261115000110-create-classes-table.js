const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

// A class (group) of a school, for example Playgroup or Nursery A. One class teacher per class for now.
// The name is unique inside a school (checked in code, deleted classes do not count).
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('classes', {
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
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      code: {
        type: DataTypes.STRING(30),
        comment: 'Short code, for example PG-A',
      },
      room: {
        type: DataTypes.STRING(60),
      },
      starts_at: {
        type: DataTypes.TIME,
        comment: 'Daily start time',
      },
      ends_at: {
        type: DataTypes.TIME,
        comment: 'Daily end time',
      },
      capacity: {
        type: DataTypes.INTEGER,
        comment: 'Planned number of seats. Empty means not set',
      },
      class_teacher_id: foreignKey('users', {
        comment: 'The class teacher (a user with role Teacher)',
      }),
      status: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: '1: Active, 2: Archived',
      },
      sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      created_by: {
        type: DataTypes.BIGINT,
        comment: 'The user who added the class. Plain number, no foreign key',
      },
      ...timestampColumns({ deletedAt: true }),
    });

    await addIndexes(queryInterface, 'classes', [
      'uuid',
      'client_id',
      'class_teacher_id',
      'deleted_at',
      ['client_id', 'status'],
      ['client_id', 'sort_order'],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('classes');
  },
};
