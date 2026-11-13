const Settings = require('@app/Helpers/settings');
const { Subscription, Plan } = require('@app/Models');
const { SUBSCRIPTION_STATUS } = require('@app/Helpers/constants');
const Entitlements = require('./Entitlements');

// Decides what a school may use right now, from its subscription (the server decides, never the browser).
//
//   const access = await SubscriptionAccess.forClient(clientId)
//   access.allowed       true when the school may use the workspace
//   access.message       why not (shown to the user)
//   access.moduleKeys    Set of module keys the school may use: the plan's modules (core always) plus/minus the school's
//                        overrides (see Entitlements.js)
//   access.limits        effective limits { max_students: 100, storage_mb: null }  (null = unlimited)
//   access.subscription  the subscription that counts (or null), access.plan its plan
//
// Rules: Active passes. Past due passes only inside the grace period (policy.grace_days from Settings, counted from
// the end of the paid period). Pending, Cancelled, Expired and Suspended do not pass.

const MESSAGES = {
  none: 'Your school does not have a subscription yet. Please complete the payment to start using Bubbly.',
  [SUBSCRIPTION_STATUS.PENDING]: 'Your subscription is waiting for the first payment to be confirmed.',
  [SUBSCRIPTION_STATUS.PAST_DUE]: 'Your last payment failed and the grace period has ended. Please update your payment to continue.',
  [SUBSCRIPTION_STATUS.CANCELLED]: 'Your subscription was cancelled. Please subscribe again to continue.',
  [SUBSCRIPTION_STATUS.EXPIRED]: 'Your subscription has expired. Please renew to continue.',
  [SUBSCRIPTION_STATUS.SUSPENDED]: 'Your subscription is suspended because of a payment problem. Please update your payment to continue.',
};

const pickCurrent = (subscriptions) =>
  subscriptions.find((s) => Number(s.status) === SUBSCRIPTION_STATUS.ACTIVE) ||
  subscriptions.find((s) => Number(s.status) === SUBSCRIPTION_STATUS.PAST_DUE) ||
  subscriptions[0] ||
  null;

const withinGrace = async (subscription) => {
  const graceDays = Number(await Settings.get('policy.grace_days')) || 0;
  const reference = subscription.currentPeriodEnd || subscription.updatedAt;
  if (!reference) return false;
  return Date.now() <= new Date(reference).getTime() + graceDays * 86400000;
};

// the subscription that counts for a school, its plan and the entitlements (plan + overrides)
const currentFor = async (clientId, { transaction } = {}) => {
  const subscriptions = await Subscription.findAll({ where: { clientId }, order: [['id', 'DESC']], transaction });
  const subscription = pickCurrent(subscriptions);
  const plan = subscription ? await Plan.findByPk(subscription.planId, { transaction }) : null;
  const entitlements = await Entitlements.compute({ clientId, subscription, plan, transaction });
  return { subscription, plan, entitlements };
};

const forClient = async (clientId) => {
  const { subscription, plan, entitlements } = await currentFor(clientId);
  const moduleKeys = entitlements.moduleKeys;
  const limits = entitlements.limitValues;

  if (!subscription) return { allowed: false, message: MESSAGES.none, status: null, subscription: null, plan: null, moduleKeys, limits };

  const status = Number(subscription.status);
  let allowed = status === SUBSCRIPTION_STATUS.ACTIVE;
  if (status === SUBSCRIPTION_STATUS.PAST_DUE) allowed = await withinGrace(subscription);

  return { allowed, message: allowed ? null : MESSAGES[status] || MESSAGES.none, status, subscription, plan, moduleKeys, limits };
};

module.exports = { forClient, currentFor, pickCurrent };
