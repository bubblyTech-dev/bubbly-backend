const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// A payment attempt reported by Razorpay. Money is in paise.
module.exports = defineModel('Payment', 'payments', {
  clientId: { type: DataTypes.BIGINT, allowNull: false },
  subscriptionId: DataTypes.BIGINT,
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
