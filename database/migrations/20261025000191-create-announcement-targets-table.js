const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('announcement_targets', {
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
      announcement_id: foreignKey('announcements', {
        allowNull: false,
        onDelete: 'CASCADE',
      }),
      target_kind: {
        type: DataTypes.SMALLINT,
        comment: '1: School, 2: Plan',
      },
      target_id: {
        type: DataTypes.BIGINT,
        comment: 'Id of the school (clients) or plan. A plain indexed number with no foreign key, because those tables are built by other modules',
      },
      ...timestampColumns({ updatedAt: false }),
    });

    await addIndexes(queryInterface, 'announcement_targets', [
      'uuid',
      'announcement_id',
      'target_kind',
      'target_id',
      ['target_kind', 'target_id'],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('announcement_targets');
  },
};
