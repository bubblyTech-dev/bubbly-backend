const Audit = require('@app/Helpers/audit');
const { Payment, Subscription } = require('@app/Models');
const { P, lock } = require('./shared');

// refund.created and refund.processed. The refund is added to the payment it belongs to.
// The same refund is announced twice (created, then processed), so it is only counted once.

const handleRefundEvent = async (event, { transaction }) => {
  const refund = event.payload && event.payload.refund && event.payload.refund.entity;
  if (!refund || !refund.id || !refund.payment_id) throw new Error('The event carries no refund.');

  let payment = await Payment.findOne({ where: { razorpayPaymentId: refund.payment_id }, transaction });
  if (!payment) return { outcome: 'ignored', message: 'The refund is for a payment we do not know.' };

  await lock(`payment:${payment.id}`, transaction);
  await payment.reload({ transaction });

  const paymentEntity = event.payload.payment && event.payload.payment.entity;
  const alreadyCounted = payment.razorpayRefundId === refund.id;

  // Razorpay's own running total is the truth when it is sent; otherwise add this refund once
  let refunded = Number(payment.refundedPaise) || 0;
  if (paymentEntity && paymentEntity.amount_refunded !== undefined) refunded = Number(paymentEntity.amount_refunded);
  else if (!alreadyCounted) refunded += Number(refund.amount) || 0;

  const status = refunded >= Number(payment.amountPaise) ? P.REFUNDED : refunded > 0 ? P.PARTIALLY_REFUNDED : payment.status;
  await payment.update({ refundedPaise: refunded, razorpayRefundId: refund.id, status }, { transaction });

  if (!alreadyCounted) {
    const subscription = payment.subscriptionId ? await Subscription.findByPk(payment.subscriptionId, { transaction }) : null;
    await Audit.log(
      {},
      'payment.refunded',
      {
        entityType: 'payment',
        entityUuid: payment.uuid,
        clientId: payment.clientId,
        description: `A refund of ${Number(refund.amount) / 100} was recorded`,
        after: { razorpayRefundId: refund.id, refundedPaise: refunded, subscriptionUuid: subscription ? subscription.uuid : null },
      },
      { transaction },
    );
  }

  return { outcome: 'processed' };
};

module.exports = { handleRefundEvent, EVENTS: ['refund.created', 'refund.processed'] };
