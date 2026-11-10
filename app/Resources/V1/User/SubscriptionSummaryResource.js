const Resource = require('@app/Resources/Resource');

// A school's own view of its subscription. `this.resource` is what SubscriptionAccess.forClient returned.
// No Razorpay ids and no internal ids.
class SubscriptionSummaryResource extends Resource {
  toArray() {
    const access = this.resource;
    const subscription = access.subscription;

    return {
      status: access.status,
      allowed: access.allowed,
      message: access.message,
      planName: access.plan ? access.plan.name : null,
      billingInterval: subscription ? Number(subscription.billingInterval) : null,
      amountPaise: subscription ? Number(subscription.amountPaise) : null,
      currency: subscription ? subscription.currency : null,
      currentPeriodStart: subscription ? subscription.currentPeriodStart : null,
      currentPeriodEnd: subscription ? subscription.currentPeriodEnd : null,
      nextChargeAt: subscription ? subscription.nextChargeAt : null,
      cancelAtCycleEnd: subscription ? Number(subscription.cancelAtCycleEnd) === 1 : false,
    };
  }
}

module.exports = SubscriptionSummaryResource;
