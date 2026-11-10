const InvoiceIssuer = require('../InvoiceIssuer');
const Provisioning = require('../../Provisioning');
const { queueReceipt, queuePaymentFailed } = require('./billingMail');
const {
  S,
  isPaid,
  findSubscription,
  lockAndReload,
  applySubscriptionEntity,
  markActivated,
  hasBeenActivated,
  audit,
  upsertPayment,
} = require('./shared');

// One handler for every subscription.* event. What is different per event lives in the table below.

// the audit action written when the event changes something (null = nothing worth recording on its own)
const AUDIT_BY_EVENT = {
  'subscription.authenticated': ['subscription.authenticated', 'The school authorised automatic payments'],
  'subscription.activated': ['subscription.activated', 'The subscription became active'],
  'subscription.charged': ['subscription.charged', 'A subscription payment was charged'],
  'subscription.pending': ['subscription.past_due', 'A renewal payment failed; the subscription is past due'],
  'subscription.halted': ['subscription.halted', 'Razorpay stopped charging after repeated failures'],
  'subscription.cancelled': ['subscription.cancelled', 'The subscription was cancelled'],
  'subscription.paused': ['subscription.paused', 'The subscription was paused'],
  'subscription.resumed': ['subscription.resumed', 'The subscription was resumed'],
  'subscription.completed': ['subscription.completed', 'The subscription ran its full term'],
  'subscription.updated': ['subscription.updated', 'The subscription was updated'],
};

const handleSubscriptionEvent = async (event, { transaction }) => {
  const entity = event.payload && event.payload.subscription && event.payload.subscription.entity;
  if (!entity || !entity.id) throw new Error('The event carries no subscription.');

  let subscription = await findSubscription(entity.id, transaction);
  if (!subscription) {
    // Razorpay retries a failed event, which also covers events that arrive before we saved the subscription
    throw new Error(`Unknown subscription ${entity.id}.`);
  }
  subscription = await lockAndReload(subscription, transaction);

  const { applied, previousStatus } = await applySubscriptionEntity({ subscription, entity, event, transaction });

  // a charge is money that moved: its payment and invoice are recorded even when the state change is old news
  const isCharge = event.event === 'subscription.charged';
  const paymentEntity = event.payload.payment && event.payload.payment.entity;
  if (isCharge && paymentEntity && paymentEntity.id) {
    const payment = await upsertPayment({ entity: paymentEntity, subscription, transaction });
    if (isPaid(payment.status)) {
      const { invoice, created } = await InvoiceIssuer.issueForPaymentWithFlag({ subscription, payment, transaction });
      if (created) queueReceipt({ subscription, invoice, transaction });
    }
  }

  if (!applied) return { outcome: 'processed', message: 'Older than what is already saved; the state was not changed.' };

  const [action, description] = AUDIT_BY_EVENT[event.event] || [];
  const statusChanged = Number(subscription.status) !== previousStatus;
  if (action && (isCharge || statusChanged)) {
    await audit(subscription, action, description, { before: { status: previousStatus }, after: { status: Number(subscription.status) } }, transaction);
  }

  // a renewal that failed: tell the school once (the payment.failed event may already have done so)
  if (event.event === 'subscription.pending' && statusChanged && Number(subscription.status) === S.PAST_DUE) {
    await queuePaymentFailed({ subscription, transaction });
  }

  // the first time the subscription is Active the school gets its workspace and Principal login
  if (Number(subscription.status) === S.ACTIVE && !hasBeenActivated(subscription)) {
    await markActivated(subscription, transaction);
    await Provisioning.onSubscriptionActivated(subscription, null, { transaction });
  }

  return { outcome: 'processed' };
};

module.exports = { handleSubscriptionEvent, EVENTS: Object.keys(AUDIT_BY_EVENT) };
