require('dotenv').config({ quiet: true });

// Razorpay settings. The keys come only from .env (never from the database or the code).
// While developing use the TEST keys (rzp_test_...); live keys are added on the server only.

const keyId = process.env.RAZORPAY_KEY_ID || '';
const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

module.exports = {
  provider: 'razorpay',
  baseUrl: 'https://api.razorpay.com/v1',
  timeoutMs: 15000,

  keyId,
  keySecret,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',

  // how many billing cycles a new subscription may be charged in total (indexed by our billing interval:
  // 1 Monthly, 2 Quarterly, 3 Yearly). 10 years in every case.
  totalCounts: { 1: 120, 2: 40, 3: 10 },

  // true when both keys are present; plan publishing still works without them (the plan just stays unsynced)
  isConfigured: Boolean(keyId && keySecret),
};
