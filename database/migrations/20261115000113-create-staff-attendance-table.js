const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

// Daily attendance of school staff (teachers), marked by the Principal. One row per person per day (checked in code):
// marking again the same day changes the row.
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('staff_attendance', {
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
        comment: 'The staff member',
      }),
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      status: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        comment: '1: Present, 2: Absent, 3: Late, 4: On leave, 5: Half day',
      },
      note: {
        type: DataTypes.STRING(200),
      },
      marked_by: {
        type: DataTypes.BIGINT,
        comment: 'The user who marked it. Plain number, no foreign key',
      },
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, 'staff_attendance', [
      'uuid',
      'client_id',
      'user_id',
      ['client_id', 'date'],
      ['client_id', 'user_id', 'date'],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('staff_attendance');
  },
};
