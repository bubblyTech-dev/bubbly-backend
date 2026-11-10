const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// A school's subscription to a plan. The status changes only from verified Razorpay events or a manual sync.
// Money is in paise. Every Razorpay id is kept in its own column.
const Subscription = defineModel(
  'Subscription',
  'subscriptions',
  {
    clientId: { type: DataTypes.BIGINT, allowNull: false },
    planId: { type: DataTypes.BIGINT, allowNull: false },
    status: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Pending, 2: Active, 3: Past due, 4: Cancelled, 5: Expired, 6: Suspended
    razorpaySubscriptionId: DataTypes.STRING(60),
    razorpayPlanId: DataTypes.STRING(60),
    razorpayCustomerId: DataTypes.STRING(60),
    billingInterval: DataTypes.SMALLINT, // 1: Monthly, 2: Quarterly, 3: Yearly
    amountPaise: DataTypes.BIGINT,
    currency: { type: DataTypes.STRING(3), defaultValue: 'INR' },
    totalCount: DataTypes.INTEGER,
    paidCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    remainingCount: DataTypes.INTEGER,
    startedAt: DataTypes.DATE,
    currentPeriodStart: DataTypes.DATE,
    currentPeriodEnd: DataTypes.DATE,
    nextChargeAt: DataTypes.DATE,
    cancelAtCycleEnd: { type: DataTypes.SMALLINT, defaultValue: 0 }, // 1: Yes, 0: No
    cancelRequestedAt: DataTypes.DATE,
    cancelledAt: DataTypes.DATE,
    endedAt: DataTypes.DATE,
    pastDueSince: DataTypes.DATE, // set when the status becomes Past due, cleared when it changes again (see the hook below)
    shortUrl: DataTypes.STRING(300),
    gatewayData: DataTypes.JSONB,
    createdBy: DataTypes.BIGINT,
  },
  { paranoid: true },
);

// Whatever changes the status (a webhook, a manual sync, a cancel), the Past due start time stays right.
Subscription.addHook('beforeSave', (subscription) => {
  if (!subscription.changed('status')) return;

  if (Number(subscription.status) === 3) {
    if (!subscription.pastDueSince) subscription.pastDueSince = new Date();
  } else {
    subscription.pastDueSince = null;
  }
});

module.exports = Subscription;
