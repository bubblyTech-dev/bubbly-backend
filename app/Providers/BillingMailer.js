const auth = require('@config/auth');
const context = require('@app/Helpers/context');
const Audit = require('@app/Helpers/audit');
const safeSetting = require('@app/Helpers/safeSetting');
const { Plan, Subscription, User } = require('@app/Models');
const { USER_ROLE } = require('@app/Helpers/constants');
const Mailer = require('./Mailer');

// The emails about money that go to a school: the receipt for a paid invoice and the notice that a payment failed.
// Both go through Mailer (Loops). The design of the email lives in Loops; the transactional ids are platform settings
// (email.loops_tx_receipt and email.loops_tx_payment_failed). Without Loops the message is printed in the terminal.
//
//   await BillingMailer.sendReceipt(invoice, school)
//   await BillingMailer.sendPaymentFailed(subscription, school, payment)   (payment may be null)
//
// Recipients: the school's contact email and, when different, the Principal's login email.
// These functions NEVER throw: a mail problem must not break a payment. A real sending failure (Loops is configured
// but refused) or any unexpected error is written to the audit log; an unconfigured Loops is not an error.

const rupees = (paise) => `₹${(Number(paise || 0) / 100).toFixed(2)}`;

const dateOnly = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

const billingUrl = () => `${auth.webAppUrl}/billing`;

const clean = (email) => String(email || '').trim().toLowerCase();

const recipientsOf = async (school) => {
  const emails = new Set([clean(school.contactEmail)]);

  const principal = await context.run(school.id, () => User.findOne({ where: { role: USER_ROLE.PRINCIPAL } }));
  if (principal) emails.add(clean(principal.email));

  emails.delete('');
  return [...emails];
};

const planNameOf = async (subscription) => {
  const plan = subscription ? await Plan.findByPk(subscription.planId, { attributes: ['name'] }) : null;
  return plan ? plan.name : '';
};

const recordFailure = async (school, action, description, entity) => {
  try {
    await Audit.log(
      {},
      action,
      { entityType: entity.type, entityUuid: entity.uuid, clientId: school.id, description },
      {},
    );
  } catch (error) {
    // nothing more can be done; the payment itself is already saved
  }
};

const deliver = async ({ school, transactionalId, data, action, entity }) => {
  try {
    for (const to of await recipientsOf(school)) {
      const result = await Mailer.sendTransactional({ to, transactionalId, data });
      if (!result.sent && process.env.LOOPS_API_KEY && transactionalId) {
        await recordFailure(school, action, `The email to ${to} was not accepted by the email service`, entity);
      }
    }
  } catch (error) {
    await recordFailure(school, action, 'The email could not be sent', entity);
  }
};

const sendReceipt = async (invoice, school) => {
  const subscription = invoice.subscriptionId ? await Subscription.findByPk(invoice.subscriptionId) : null;

  return deliver({
    school,
    transactionalId: (await safeSetting('email.loops_tx_receipt', '')) || process.env.LOOPS_TX_RECEIPT,
    data: {
      schoolName: school.name || '',
      invoiceNo: invoice.invoiceNo,
      amount: rupees(invoice.totalPaise),
      amountRupees: Number(invoice.totalPaise || 0) / 100,
      planName: await planNameOf(subscription),
      periodStart: dateOnly(invoice.periodStart),
      periodEnd: dateOnly(invoice.periodEnd),
      billingUrl: billingUrl(),
    },
    action: 'billing_mail.receipt_failed',
    entity: { type: 'invoice', uuid: invoice.uuid },
  });
};

const sendPaymentFailed = async (subscription, school, payment) =>
  deliver({
    school,
    transactionalId: (await safeSetting('email.loops_tx_payment_failed', '')) || process.env.LOOPS_TX_PAYMENT_FAILED,
    data: {
      schoolName: school.name || '',
      planName: await planNameOf(subscription),
      amount: rupees(payment ? payment.amountPaise : subscription.amountPaise),
      reason: (payment && payment.failureReason) || '',
      billingUrl: billingUrl(),
    },
    action: 'billing_mail.payment_failed_failed',
    entity: { type: 'subscription', uuid: subscription.uuid },
  });

module.exports = { sendReceipt, sendPaymentFailed };
