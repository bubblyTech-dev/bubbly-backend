const { Client } = require('@app/Models');
const BillingMailer = require('@app/Providers/BillingMailer');
const { webhookMeta } = require('./shared');

// Sends the billing emails for a webhook event, but only AFTER the whole event has been saved for good.
// A mail never changes the outcome of the event: any problem is swallowed here (BillingMailer audits real failures).

// One real failure usually arrives as two events (payment.failed and then subscription.pending). A second failure
// notice for the same subscription inside this window is skipped, so the school gets one email, not two.
// Technical de-duplication, not a business rule.
const FAILURE_MAIL_COOLDOWN_MINUTES = 60;

// The event runs inside a savepoint of the real transaction. Hooks must hang on the outermost one: they run only if
// everything commits, and never for a rolled back event.
const outermost = (transaction) => {
  let current = transaction;
  while (current.parent) current = current.parent;
  return current;
};

const afterCommit = (transaction, send) => {
  outermost(transaction).afterCommit(() => {
    Promise.resolve()
      .then(send)
      .catch(() => {});
  });
};

const schoolOf = (subscription) => Client.findByPk(subscription.clientId);

const queueReceipt = ({ subscription, invoice, transaction }) => {
  afterCommit(transaction, async () => BillingMailer.sendReceipt(invoice, await schoolOf(subscription)));
};

const queuePaymentFailed = async ({ subscription, payment = null, transaction }) => {
  const meta = webhookMeta(subscription);
  const last = meta.lastFailureMailAt ? new Date(meta.lastFailureMailAt).getTime() : 0;
  if (Date.now() - last < FAILURE_MAIL_COOLDOWN_MINUTES * 60000) return;

  await subscription.update(
    { gatewayData: { ...(subscription.gatewayData || {}), _webhook: { ...meta, lastFailureMailAt: new Date().toISOString() } } },
    { transaction },
  );

  afterCommit(transaction, async () => BillingMailer.sendPaymentFailed(subscription, await schoolOf(subscription), payment));
};

module.exports = { queueReceipt, queuePaymentFailed };
