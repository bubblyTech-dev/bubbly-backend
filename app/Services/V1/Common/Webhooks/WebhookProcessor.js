const { handleSubscriptionEvent, EVENTS: SUBSCRIPTION_EVENTS } = require('./handlers/subscriptionEvents');
const { handlePaymentEvent, EVENTS: PAYMENT_EVENTS } = require('./handlers/paymentEvents');
const { handleRefundEvent, EVENTS: REFUND_EVENTS } = require('./handlers/refundEvents');

// Routes an event to its handler. To support a new event, write a handler in ./handlers and list it here.
// A handler returns { outcome: 'processed' | 'ignored', message? } or throws (the event is then stored as Failed
// and Razorpay retries it).

const registry = new Map();
SUBSCRIPTION_EVENTS.forEach((name) => registry.set(name, handleSubscriptionEvent));
PAYMENT_EVENTS.forEach((name) => registry.set(name, handlePaymentEvent));
REFUND_EVENTS.forEach((name) => registry.set(name, handleRefundEvent));

const supportedEvents = () => [...registry.keys()];

const process = async (event, { transaction }) => {
  const handler = registry.get(event.event);
  if (!handler) return { outcome: 'ignored', message: `Event type ${event.event} is not handled.` };
  return handler(event, { transaction });
};

module.exports = { process, supportedEvents };
