const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// The last invoice number given out in each calendar year.
module.exports = defineModel('InvoiceCounter', 'invoice_counters', {
  year: DataTypes.INTEGER,
  lastNumber: { type: DataTypes.INTEGER, defaultValue: 0 },
});
