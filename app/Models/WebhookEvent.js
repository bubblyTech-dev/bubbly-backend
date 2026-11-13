const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// Every call the payment provider makes to our webhook, stored before it is processed.
module.exports = defineModel('WebhookEvent', 'webhook_events', {
  provider: { type: DataTypes.STRING(30), defaultValue: 'razorpay' },
  eventId: DataTypes.STRING(80),
  eventType: DataTypes.STRING(80),
  status: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Received, 2: Processed, 3: Failed, 4: Ignored
  payload: DataTypes.JSONB,
  signatureValid: DataTypes.SMALLINT, // 1: Yes, 0: No
  attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
  receivedAt: DataTypes.DATE,
  processedAt: DataTypes.DATE,
  errorMessage: DataTypes.STRING(500),
});
