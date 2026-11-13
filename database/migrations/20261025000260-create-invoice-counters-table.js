const { DataTypes, Sequelize } = require('sequelize');
const { timestampColumns, addIndexes } = require('../helpers');

// One row per calendar year holding the last invoice number given out, so numbers are gapless and never repeat.
// The number is taken inside the invoice transaction under a lock (see InvoiceIssuer), never by the database.
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('invoice_counters', {
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
      year: {
        type: DataTypes.INTEGER,
        comment: 'Calendar year of the invoices, for example 2026',
      },
      last_number: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'Last invoice number given out in that year',
      },
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, 'invoice_counters', ['uuid', 'year']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('invoice_counters');
  },
};
