const axios = require('axios');
const crypto = require('crypto');
const payment = require('@config/payment');
const AppError = require('@app/Helpers/AppError');

// Every Razorpay call in the backend lives in this one file. Other code never talks to Razorpay directly.
//
// Notes
//   - Razorpay has no separate "products" API for subscriptions. A plan carries its own `item`
//     (name, amount in paise, currency), so creating the plan is the same as creating the product.
//   - Razorpay plans cannot be edited, so a plan is created once and its id is stored (plans.razorpay_plan_id).
//   - Every function returns the raw Razorpay object. The caller stores the ids it needs.
//   - Money is always in paise. The keys come from config/payment.js and are never logged or sent anywhere else.
//   - A subscription is cancelled at the end of the billing period (cancelSubscription defaults to that).

const isConfigured = () => payment.isConfigured;

const assertConfigured = () => {
  if (!payment.isConfigured) {
    throw new AppError(503, 'The payment gateway is not set up yet.', { code: 'PAYMENT_GATEWAY_NOT_CONFIGURED' });
  }
};

const http = () =>
  axios.create({
    baseURL: payment.baseUrl,
    timeout: payment.timeoutMs,
    auth: { username: payment.keyId, password: payment.keySecret },
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  });

// Turns a Razorpay or network failure into an error that is safe to show. Nothing from the request (keys, headers) is copied.
const toAppError = (error) => {
  const response = error.response;

  if (!response) {
    return new AppError(502, 'Could not reach the payment gateway. Please try again.', { code: 'PAYMENT_GATEWAY_ERROR' });
  }

  const description = response.data && response.data.error && response.data.error.description;

  // Razorpay refused the request because of what we sent (bad values, wrong state): show its reason
  if ([400, 404, 409, 422].includes(response.status) && description) {
    return new AppError(422, description, { code: 'PAYMENT_GATEWAY_REJECTED' });
  }

  // 401 means our keys are wrong; that is our problem, not something to explain to the user
  if (response.status === 401) {
    return new AppError(502, 'The payment gateway rejected our credentials.', { code: 'PAYMENT_GATEWAY_ERROR' });
  }

  return new AppError(502, description || 'The payment gateway returned an error.', { code: 'PAYMENT_GATEWAY_ERROR' });
};

const call = async (method, path, { data, params } = {}) => {
  assertConfigured();
  try {
    const response = await http().request({ method, url: path, data, params });
    return response.data;
  } catch (error) {
    throw toAppError(error);
  }
};

// our billing interval (1 Monthly, 2 Quarterly, 3 Yearly) -> what Razorpay calls it
const PERIODS = {
  1: { period: 'monthly', interval: 1 },
  2: { period: 'monthly', interval: 3 },
  3: { period: 'yearly', interval: 1 },
};

const toRazorpayPeriod = (billingInterval) => {
  const period = PERIODS[Number(billingInterval)];
  if (!period) throw new AppError(422, 'This billing interval is not supported by the payment gateway.', { code: 'PAYMENT_GATEWAY_REJECTED' });
  return { ...period };
};

// ---------- customers ----------

// fail_existing must be the string "0" (checked against the Razorpay API; a number is ignored). With it, creating the
// same email and phone again returns the existing customer instead of an error.
const createCustomer = ({ name, email, contact, notes }) =>
  call('post', '/customers', { data: { name, email, contact, fail_existing: '0', notes } });

const fetchCustomer = (customerId) => call('get', `/customers/${customerId}`);

// ---------- plans (the plan carries the item, there is no separate product) ----------

const createPlan = ({ name, description, amountPaise, currency = 'INR', billingInterval, notes }) => {
  const { period, interval } = toRazorpayPeriod(billingInterval);

  return call('post', '/plans', {
    data: {
      period,
      interval,
      item: { name, description, amount: Number(amountPaise), currency },
      notes,
    },
  });
};

const fetchPlan = (planId) => call('get', `/plans/${planId}`);

const listPlans = ({ count = 10, skip = 0 } = {}) => call('get', '/plans', { params: { count, skip } });

// ---------- subscriptions ----------

// startAt is a Date (optional); Razorpay needs a time in the future
const createSubscription = ({ planId, customerId, totalCount, startAt, customerNotify = true, notes }) => {
  const data = {
    plan_id: planId,
    total_count: Number(totalCount),
    quantity: 1,
    customer_notify: customerNotify ? 1 : 0,
    notes,
  };
  if (customerId) data.customer_id = customerId;
  if (startAt) data.start_at = Math.floor(new Date(startAt).getTime() / 1000);

  return call('post', '/subscriptions', { data });
};

const fetchSubscription = (subscriptionId) => call('get', `/subscriptions/${subscriptionId}`);

// Default and only normal mode: the subscription stops after the current period. atCycleEnd = false cancels at once
// and is only used for a subscription that never started (nothing was charged).
const cancelSubscription = (subscriptionId, { atCycleEnd = true } = {}) =>
  call('post', `/subscriptions/${subscriptionId}/cancel`, { data: { cancel_at_cycle_end: atCycleEnd ? 1 : 0 } });

const pauseSubscription = (subscriptionId) => call('post', `/subscriptions/${subscriptionId}/pause`, { data: { pause_at: 'now' } });

const resumeSubscription = (subscriptionId) => call('post', `/subscriptions/${subscriptionId}/resume`, { data: { resume_at: 'now' } });

// ---------- invoices, payments, refunds ----------

const fetchSubscriptionInvoices = (subscriptionId) => call('get', '/invoices', { params: { subscription_id: subscriptionId } });

const fetchInvoice = (invoiceId) => call('get', `/invoices/${invoiceId}`);

const fetchPayment = (paymentId) => call('get', `/payments/${paymentId}`);

// amountPaise is optional: without it the whole payment is refunded
const refundPayment = (paymentId, { amountPaise, notes } = {}) => {
  const data = { notes };
  if (amountPaise !== undefined) data.amount = Number(amountPaise);
  return call('post', `/payments/${paymentId}/refund`, { data });
};

// ---------- signatures ----------

const sign = (message, secret) => crypto.createHmac('sha256', secret).update(message).digest('hex');

const safeEqual = (expected, given) => {
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(given || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// After checkout Razorpay sends the browser razorpay_payment_id, razorpay_subscription_id and razorpay_signature.
// The signature proves they are genuine. A verified browser callback is still only a hint: the subscription
// is activated from the verified webhook, never from the browser.
const verifyCheckoutSignature = ({ paymentId, subscriptionId, signature }) => {
  if (!payment.keySecret || !paymentId || !subscriptionId || !signature) return false;
  return safeEqual(sign(`${paymentId}|${subscriptionId}`, payment.keySecret), signature);
};

// The webhook carries X-Razorpay-Signature: an HMAC of the raw request body with the webhook secret.
// rawBody must be the exact bytes received (a string or Buffer), not re-serialised JSON.
const verifyWebhookSignature = (rawBody, signature) => {
  if (!payment.webhookSecret || rawBody === undefined || rawBody === null || !signature) return false;
  return safeEqual(sign(rawBody, payment.webhookSecret), signature);
};

module.exports = {
  isConfigured,
  toRazorpayPeriod,
  createCustomer,
  fetchCustomer,
  createPlan,
  fetchPlan,
  listPlans,
  createSubscription,
  fetchSubscription,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  fetchSubscriptionInvoices,
  fetchInvoice,
  fetchPayment,
  refundPayment,
  verifyCheckoutSignature,
  verifyWebhookSignature,
};
