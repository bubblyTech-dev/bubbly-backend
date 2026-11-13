const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, foreignKey, addIndexes } = require('../helpers');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('plans', {
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
      slug: {
        type: DataTypes.STRING(150),
        comment: 'Used in public links. Uniqueness is checked in code',
      },
      description: {
        type: DataTypes.STRING(1000),
      },
      price_paise: {
        type: DataTypes.BIGINT,
        defaultValue: 0,
        comment: 'Price in paise (100 paise = 1 rupee) for one billing interval',
      },
      currency: {
        type: DataTypes.STRING(3),
        defaultValue: 'INR',
      },
      billing_interval: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: '1: Monthly, 2: Quarterly, 3: Yearly',
      },
      tax_inclusive: {
        type: DataTypes.SMALLINT,
        defaultValue: 0,
        comment: '1: Price includes GST, 0: GST is added on top',
      },
      status: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: '1: Draft, 2: Published, 3: Archived',
      },
      sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      is_featured: {
        type: DataTypes.SMALLINT,
        defaultValue: 0,
        comment: '1: Highlighted on the pricing page, 0: No',
      },
      version: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        comment: 'Goes up by one each time a plan is duplicated to change its price',
      },
      published_at: {
        type: DataTypes.DATE,
      },
      archived_at: {
        type: DataTypes.DATE,
      },
      created_by: foreignKey('admin_users', {
        comment: 'Who created this plan',
      }),
      updated_by: foreignKey('admin_users', {
        comment: 'Who changed it last',
      }),
      ...timestampColumns({ deletedAt: true }),
    });

    await addIndexes(queryInterface, 'plans', [
      'uuid',
      'slug',
      'status',
      'billing_interval',
      'sort_order',
      'created_by',
      'updated_by',
      'deleted_at',
      ['status', 'sort_order'],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('plans');
  },
};
