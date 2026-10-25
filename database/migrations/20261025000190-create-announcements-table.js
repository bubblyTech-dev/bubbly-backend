const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('announcements', {
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
      title: {
        type: DataTypes.STRING(200),
      },
      body: {
        type: DataTypes.TEXT,
      },
      type: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: '1: Info, 2: Warning, 3: Maintenance',
      },
      status: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: '1: Draft, 2: Scheduled, 3: Published, 4: Expired. Scheduled, Published and Expired are worked out from the dates when read',
      },
      target_type: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: '1: All schools, 2: Selected schools, 3: Selected plans',
      },
      starts_at: {
        type: DataTypes.DATE,
        comment: 'When the notice becomes visible',
      },
      ends_at: {
        type: DataTypes.DATE,
        comment: 'When the notice stops being visible. Empty means no end',
      },
      published_at: {
        type: DataTypes.DATE,
        comment: 'When an admin published it',
      },
      created_by: foreignKey('admin_users', {
        comment: 'Who wrote it',
      }),
      updated_by: foreignKey('admin_users', {
        comment: 'Who changed it last',
      }),
      ...timestampColumns({ deletedAt: true }),
    });

    await addIndexes(queryInterface, 'announcements', [
      'uuid',
      'type',
      'status',
      'target_type',
      'starts_at',
      'ends_at',
      'created_by',
      'updated_by',
      'deleted_at',
      ['status', 'starts_at', 'ends_at'],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('announcements');
  },
};
