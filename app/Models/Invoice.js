const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// Our own GST invoice. Seller and buyer details are copied when it is issued. Money is in paise.
module.exports = defineModel('Invoice', 'invoices', {
  clientId: { type: DataTypes.BIGINT, allowNull: false },
  subscriptionId: DataTypes.BIGINT,
  paymentId: DataTypes.BIGINT,
  invoiceNo: DataTypes.STRING(40),
  razorpayInvoiceId: DataTypes.STRING(60),
  status: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Draft, 2: Issued, 3: Paid, 4: Void
  issuedAt: DataTypes.DATE,
  periodStart: DataTypes.DATE,
  periodEnd: DataTypes.DATE,
  subtotalPaise: DataTypes.BIGINT,
  taxPaise: DataTypes.BIGINT,
  totalPaise: DataTypes.BIGINT,
  taxRatePercent: DataTypes.DECIMAL(5, 2),
  gstNumber: DataTypes.STRING(20),
  sellerGstNumber: DataTypes.STRING(20),
  sellerName: DataTypes.STRING(200),
  sellerAddress: DataTypes.TEXT,
  buyerName: DataTypes.STRING(200),
  buyerAddress: DataTypes.TEXT,
  pdfFile: DataTypes.STRING(120), // file name only; the folder comes from config/files.js
});
