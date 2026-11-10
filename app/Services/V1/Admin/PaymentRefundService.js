const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const Settings = require('@app/Helpers/settings');
const { isUuid } = require('@app/Helpers/ref');
const { sequelize } = require('@app/Helpers/database');
const { PAYMENT_STATUS } = require('@app/Helpers/constants');
const { Client, Payment, Subscription } = require('@app/Models');
const PaymentResource = require('@app/Resources/V1/Admin/PaymentResource');
const Razorpay = require('@app/Services/V1/Common/PaymentGateway/RazorpayService');
const SubscriptionService = require('./SubscriptionService');

// Refunds of payments. `ctx` is { admin, ip, userAgent }.
//
// A Razorpay payment is refunded at Razorpay first, then we record it; an offline payment (no Razorpay payment id) is only
// recorded here. The row is locked while we work, so two refunds at once cannot both pass the balance check.
// The Razorpay refund webhook announces the same refund later; it reads Razorpay's own running total and the refund id we
// stored here, so nothing is counted twice.
// Cancelling the subscription is optional and always happens at the end of the current period.

const P = PAYMENT_STATUS;

const DEFAULT_REASONS = ['Duplicate payment', 'Customer request', 'Service issue', 'Other'];

// The reasons come from Settings (billing.refund_reasons). The setting may be a list or one text with a reason per line or
// separated by commas, and may not exist yet.
const refundReasons = async () => {
  let value;
  try {
    value = await Settings.get('billing.refund_reasons');
  } catch (error) {
    value = null;
  }
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\n,]/) : [];
  const cleaned = list.map((item) => String(item).trim()).filter(Boolean);
  return cleaned.length ? cleaned : DEFAULT_REASONS;
};

const isOffline = (payment) => !payment.razorpayPaymentId;

const refundable = (payment) =>
  [P.CAPTURED, P.PARTIALLY_REFUNDED].includes(Number(payment.status))
    ? Math.max(0, Number(payment.amountPaise) - (Number(payment.refundedPaise) || 0))
    : 0;

const snapshot = (payment) => ({
  status: Number(payment.status),
  refundedPaise: Number(payment.refundedPaise) || 0,
  razorpayRefundId: payment.razorpayRefundId,
});

const options = async () => ({ reasons: await refundReasons() });

const refund = async (uuid, input, ctx) => {
  if (!isUuid(uuid)) throw AppError.notFound();

  const reasons = await refundReasons();
  if (!reasons.includes(input.reason)) throw AppError.validation({ reason: ['Choose one of the listed reasons.'] });

  const result = await sequelize.transaction(async (transaction) => {
    // lock the plain row first (Postgres cannot lock a row that is joined to optional tables)
    const locked = await Payment.findOne({ where: { uuid }, lock: transaction.LOCK.UPDATE, transaction });
    if (!locked) throw AppError.notFound();

    const payment = await Payment.findOne({
      where: { uuid },
      include: [
        { model: Client, as: 'client', attributes: ['id', 'uuid', 'name'] },
        { model: Subscription, as: 'subscription', attributes: ['id', 'uuid', 'razorpaySubscriptionId'] },
      ],
      transaction,
    });

    if (![P.CAPTURED, P.PARTIALLY_REFUNDED].includes(Number(payment.status))) {
      throw AppError.validation({ payment: ['Only a paid payment can be refunded.'] });
    }

    const balance = refundable(payment);
    if (balance <= 0) throw AppError.validation({ amountPaise: ['This payment has nothing left to refund.'] });

    const amountPaise = input.amountPaise === undefined ? balance : Number(input.amountPaise);
    if (!Number.isInteger(amountPaise) || amountPaise < 1 || amountPaise > balance) {
      throw AppError.validation({ amountPaise: [`Enter an amount between 1 paise and ${balance} paise (the refundable balance).`] });
    }

    const before = snapshot(payment);
    const alreadyRefunded = Number(payment.refundedPaise) || 0;
    let refundId = payment.razorpayRefundId;
    let refundedTotal = alreadyRefunded + amountPaise;

    if (!isOffline(payment)) {
      // Razorpay first: if it refuses, nothing is written here
      const remote = await Razorpay.refundPayment(payment.razorpayPaymentId, {
        amountPaise,
        notes: {
          paymentUuid: payment.uuid,
          reason: input.reason,
          ...(input.note ? { note: String(input.note).slice(0, 250) } : {}),
        },
      });
      refundId = remote.id || refundId;

      // Razorpay's own running total is the truth when it can be read
      const live = await Razorpay.fetchPayment(payment.razorpayPaymentId).catch(() => null);
      if (live && live.amount_refunded !== undefined && Number(live.amount_refunded) >= refundedTotal) {
        refundedTotal = Number(live.amount_refunded);
      }
    }

    const status = refundedTotal >= Number(payment.amountPaise) ? P.REFUNDED : P.PARTIALLY_REFUNDED;
    await payment.update({ refundedPaise: refundedTotal, status, razorpayRefundId: refundId }, { transaction });

    await Audit.log(
      ctx,
      'payment.refunded',
      {
        entityType: 'payment',
        entityUuid: payment.uuid,
        clientId: payment.clientId,
        description: `Refunded Rs. ${(amountPaise / 100).toFixed(2)} (${input.reason})${isOffline(payment) ? ' as an offline payment' : ''}`,
        before,
        after: { ...snapshot(payment), amountPaise, reason: input.reason, note: input.note || null, offline: isOffline(payment) },
      },
      { transaction },
    );

    return payment;
  });

  // optional: end the subscription after the current period. The refund stays even if this step cannot be done.
  let warning = null;
  if (input.cancelSubscription && ['true', true, 1, '1'].includes(input.cancelSubscription)) {
    const subscription = result.subscription;
    if (!subscription) {
      warning = 'This payment has no subscription, so there was nothing to cancel.';
    } else if (!subscription.razorpaySubscriptionId) {
      warning = 'The refund was recorded, but this subscription is not on Razorpay. End it from the Subscriptions page.';
    } else {
      try {
        await SubscriptionService.cancel(subscription.uuid, ctx);
      } catch (error) {
        const detail = error && error.errors && error.errors.subscription ? error.errors.subscription[0] : error.message;
        warning = `The refund was recorded, but the subscription could not be cancelled: ${detail}`;
      }
    }
  }

  const payment = await Payment.findOne({
    where: { uuid },
    include: [
      { model: Client, as: 'client', attributes: ['id', 'uuid', 'name'] },
      { model: Subscription, as: 'subscription', attributes: ['id', 'uuid'] },
    ],
  });

  return { payment: PaymentResource.make(payment), warning };
};

module.exports = { refund, options, refundReasons, refundable };
