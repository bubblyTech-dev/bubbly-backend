const Audit = require('@app/Helpers/audit');
const { sequelize } = require('@app/Helpers/database');
const { SUBSCRIPTION_STATUS, PAYMENT_STATUS, YES } = require('@app/Helpers/constants');
const { Subscription, Payment } = require('@app/Models');
const SubscriptionService = require('@app/Services/V1/Admin/SubscriptionService');

// Helpers shared by every webhook handler. A handler receives the parsed event and { transaction }.

const S = SUBSCRIPTION_STATUS;
const P = PAYMENT_STATUS;

// money was really taken (and maybe partly or fully returned later): such a payment gets an invoice
const isPaid = (status) => [P.CAPTURED, P.PARTIALLY_REFUNDED, P.REFUNDED].includes(Number(status));

const TERMINAL = [S.CANCELLED, S.EXPIRED];
const isTerminal = (status) => TERMINAL.includes(Number(status));

const fromUnix = (seconds) => (seconds ? new Date(Number(seconds) * 1000) : null);

// takes a transaction-scoped Postgres lock for the key; it is released when the transaction ends
const lock = (key, transaction) =>
  sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key }, transaction });

const findSubscription = (razorpaySubscriptionId, transaction) =>
  Subscription.findOne({ where: { razorpaySubscriptionId }, transaction });

// All events of one subscription are handled one at a time, so a charge and its payment event can never both
// create an invoice. After waiting for the lock the row is read again, because it may have changed meanwhile.
const lockAndReload = async (subscription, transaction) => {
  await lock(`subscription:${subscription.id}`, transaction);
  await subscription.reload({ transaction });
  return subscription;
};

// Razorpay state for an event that arrives without the state on the entity
const STATE_BY_EVENT = {
  'subscription.authenticated': 'authenticated',
  'subscription.activated': 'active',
  'subscription.charged': 'active',
  'subscription.pending': 'pending',
  'subscription.halted': 'halted',
  'subscription.cancelled': 'cancelled',
  'subscription.paused': 'paused',
  'subscription.resumed': 'active',
  'subscription.completed': 'completed',
};

const webhookMeta = (subscription) => (subscription.gatewayData && subscription.gatewayData._webhook) || {};

// Copies a Razorpay subscription object onto our row unless the event is old news.
// "Old news": it was created before an event we already applied, or our subscription already ended
// (Cancelled and Expired are final; a late "authenticated" must not bring one back to life).
// Returns { applied, previousStatus }.
const applySubscriptionEntity = async ({ subscription, entity, event, transaction }) => {
  const previousStatus = Number(subscription.status);
  const meta = webhookMeta(subscription);
  const eventAt = Number(event.created_at) || 0;
  const remote = { ...entity, status: entity.status || STATE_BY_EVENT[event.event] };

  const fields = SubscriptionService.fieldsFromRazorpay(remote);
  const stale = Boolean(meta.lastEventAt && eventAt && eventAt < Number(meta.lastEventAt));
  const revival = isTerminal(previousStatus) && !isTerminal(fields.status);

  if (stale || revival) return { applied: false, previousStatus };

  const changes = {
    ...fields,
    gatewayData: { ...remote, _webhook: { ...meta, lastEventAt: Math.max(Number(meta.lastEventAt) || 0, eventAt) } },
  };
  if (fields.status === S.CANCELLED && !subscription.cancelledAt) {
    changes.cancelledAt = fromUnix(remote.ended_at) || fromUnix(eventAt) || new Date();
  }
  if (fields.status === S.ACTIVE && !subscription.startedAt) changes.startedAt = fromUnix(remote.start_at) || new Date();
  // a subscription with scheduled changes while active is one that will stop at the end of the period
  if (remote.has_scheduled_changes && fields.status === S.ACTIVE) changes.cancelAtCycleEnd = YES;

  await subscription.update(changes, { transaction });
  return { applied: true, previousStatus };
};

// remembers in gateway_data that the first activation has been handled (so provisioning runs once)
const markActivated = async (subscription, transaction) => {
  const data = subscription.gatewayData || {};
  await subscription.update({ gatewayData: { ...data, _webhook: { ...webhookMeta(subscription), activated: true } } }, { transaction });
};

const hasBeenActivated = (subscription) => Boolean(webhookMeta(subscription).activated);

// the audit log of a webhook change: actor System, tied to the school
const audit = (subscription, action, description, { before, after } = {}, transaction) =>
  Audit.log(
    {},
    action,
    {
      entityType: 'subscription',
      entityUuid: subscription.uuid,
      clientId: subscription.clientId,
      description,
      before,
      after,
    },
    { transaction },
  );

const PAYMENT_STATUS_BY_RAZORPAY = {
  created: P.CREATED,
  authorized: P.AUTHORIZED,
  captured: P.CAPTURED,
  failed: P.FAILED,
  refunded: P.REFUNDED,
};

// a payment never moves backwards (a late "authorized" after "captured" is ignored)
const RANK = { [P.CREATED]: 0, [P.FAILED]: 1, [P.AUTHORIZED]: 1, [P.CAPTURED]: 2, [P.PARTIALLY_REFUNDED]: 3, [P.REFUNDED]: 4 };

// Creates or updates our payment row from a Razorpay payment object. One row per Razorpay payment id.
const upsertPayment = async ({ entity, subscription, transaction }) => {
  const existing = await Payment.findOne({ where: { razorpayPaymentId: entity.id }, transaction, lock: transaction.LOCK.UPDATE });

  let status = PAYMENT_STATUS_BY_RAZORPAY[entity.status] ?? P.CREATED;
  if (Number(entity.amount_refunded) > 0 && entity.status !== 'failed') {
    status = Number(entity.amount_refunded) >= Number(entity.amount) ? P.REFUNDED : P.PARTIALLY_REFUNDED;
  }

  const fields = {
    clientId: subscription.clientId,
    subscriptionId: subscription.id,
    razorpayPaymentId: entity.id,
    razorpayOrderId: entity.order_id || null,
    razorpayInvoiceId: entity.invoice_id || null,
    method: entity.method || null,
    amountPaise: entity.amount,
    currency: entity.currency || 'INR',
    feePaise: entity.fee ?? null,
    taxPaise: entity.tax ?? null,
    refundedPaise: Number(entity.amount_refunded) || 0,
    failureCode: entity.error_code || null,
    failureReason: entity.error_description ? String(entity.error_description).slice(0, 500) : null,
    paidAt: isPaid(status) ? fromUnix(entity.created_at) : null,
    gatewayData: entity,
  };

  if (!existing) return Payment.create({ ...fields, status }, { transaction });

  const keep = RANK[Number(existing.status)] > RANK[status];
  await existing.update(keep ? { gatewayData: entity } : { ...fields, status, paidAt: fields.paidAt || existing.paidAt }, { transaction });
  return existing;
};

module.exports = {
  S,
  P,
  isTerminal,
  isPaid,
  fromUnix,
  lock,
  findSubscription,
  lockAndReload,
  applySubscriptionEntity,
  markActivated,
  hasBeenActivated,
  webhookMeta,
  audit,
  upsertPayment,
};
