const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// A payment reported by Razorpay, or recorded by staff when a school pays offline. Money is in paise.
module.exports = defineModel('Payment', 'payments', {
  clientId: { type: DataTypes.BIGINT, allowNull: false },
  subscriptionId: DataTypes.BIGINT,
  source: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Razorpay, 2: Offline (recorded by staff)
  recordedBy: DataTypes.BIGINT, // staff member who recorded an offline payment
  reference: DataTypes.STRING(120), // bank reference, cheque number or UPI id of an offline payment
  notes: DataTypes.STRING(500), // internal note on an offline payment
  razorpayPaymentId: DataTypes.STRING(60),
  razorpayOrderId: DataTypes.STRING(60),
  razorpayInvoiceId: DataTypes.STRING(60),
  razorpayRefundId: DataTypes.STRING(60),
  status: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Created, 2: Authorized, 3: Captured, 4: Failed, 5: Refunded, 6: Partially refunded
  method: DataTypes.STRING(30),
  amountPaise: DataTypes.BIGINT,
  currency: { type: DataTypes.STRING(3), defaultValue: 'INR' },
  feePaise: DataTypes.BIGINT,
  taxPaise: DataTypes.BIGINT,
  refundedPaise: { type: DataTypes.BIGINT, defaultValue: 0 },
  failureCode: DataTypes.STRING(100),
  failureReason: DataTypes.STRING(500),
  paidAt: DataTypes.DATE,
  gatewayData: DataTypes.JSONB,
});
