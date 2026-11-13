const Razorpay = require('@app/Services/V1/Common/PaymentGateway/RazorpayService');
const { Payment, Subscription } = require('@app/Models');
const InvoiceIssuer = require('../InvoiceIssuer');
const { queueReceipt, queuePaymentFailed } = require('./billingMail');
const { S, isPaid, lockAndReload, audit, upsertPayment, findSubscription } = require('./shared');

// payment.authorized, payment.captured and payment.failed.
// A subscription charge normally arrives as subscription.charged (which already saves the payment and the invoice),
// so these events mostly confirm or add detail. They matter for payments that never become a charge: a failed
// renewal attempt only exists as payment.failed.

// Which of our subscriptions does this payment belong to? Several ways, cheapest first. null = not ours.
const resolveSubscription = async (event, entity, transaction) => {
  const fromEvent = event.payload.subscription && event.payload.subscription.entity;
  if (fromEvent && fromEvent.id) {
    const found = await findSubscription(fromEvent.id, transaction);
    if (found) return found;
  }

  const known = await Payment.findOne({ where: { razorpayPaymentId: entity.id }, transaction });
  if (known && known.subscriptionId) return Subscription.findByPk(known.subscriptionId, { transaction });

  if (entity.invoice_id) {
    const sameInvoice = await Payment.findOne({ where: { razorpayInvoiceId: entity.invoice_id }, transaction });
    if (sameInvoice && sameInvoice.subscriptionId) return Subscription.findByPk(sameInvoice.subscriptionId, { transaction });
  }

  const uuid = entity.notes && entity.notes.subscription_uuid;
  if (uuid) {
    const byNote = await Subscription.findOne({ where: { uuid }, transaction });
    if (byNote) return byNote;
  }

  // last resort: a subscription payment carries the id of its Razorpay invoice, and that invoice names the subscription
  if (entity.invoice_id && Razorpay.isConfigured()) {
    try {
      const invoice = await Razorpay.fetchInvoice(entity.invoice_id);
      if (invoice && invoice.subscription_id) return findSubscription(invoice.subscription_id, transaction);
    } catch (error) {
      return null;
    }
  }
  return null;
};

const handlePaymentEvent = async (event, { transaction }) => {
  const entity = event.payload && event.payload.payment && event.payload.payment.entity;
  if (!entity || !entity.id) throw new Error('The event carries no payment.');

  let subscription = await resolveSubscription(event, entity, transaction);
  if (!subscription) return { outcome: 'ignored', message: 'The payment does not belong to a subscription of ours.' };
  subscription = await lockAndReload(subscription, transaction);

  const payment = await upsertPayment({ entity, subscription, transaction });

  if (event.event === 'payment.captured' && isPaid(payment.status)) {
    const { invoice, created } = await InvoiceIssuer.issueForPaymentWithFlag({ subscription, payment, transaction });
    if (created) queueReceipt({ subscription, invoice, transaction });
  }

  if (event.event === 'payment.failed') {
    const reason = entity.error_description ? `: ${String(entity.error_description).slice(0, 120)}` : '';
    await audit(
      subscription,
      'subscription.payment_failed',
      `A payment failed${reason}`,
      { after: { razorpayPaymentId: entity.id, errorCode: entity.error_code || null, status: Number(subscription.status) } },
      transaction,
    );
    await queuePaymentFailed({ subscription, payment, transaction });
  }

  return { outcome: 'processed', message: Number(subscription.status) === S.CANCELLED ? 'Recorded for a cancelled subscription.' : undefined };
};

module.exports = { handlePaymentEvent, EVENTS: ['payment.authorized', 'payment.captured', 'payment.failed'] };
