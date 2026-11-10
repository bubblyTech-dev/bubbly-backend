const Resource = require('@app/Resources/Resource');

// A school's subscription for the Admin app. Every stored Razorpay id is shown (admins only).
class SubscriptionResource extends Resource {
  toArray() {
    const subscription = this.resource;

    return {
      uuid: subscription.uuid,
      status: Number(subscription.status),
      source: Number(subscription.source) || 1, // 1: Razorpay, 2: Offline
      client: this.when(subscription.client, () => ({ uuid: subscription.client.uuid, name: subscription.client.name })),
      plan: this.when(subscription.plan, () => ({
        uuid: subscription.plan.uuid,
        name: subscription.plan.name,
        version: subscription.plan.version,
      })),
      razorpaySubscriptionId: subscription.razorpaySubscriptionId,
      razorpayPlanId: subscription.razorpayPlanId,
      razorpayCustomerId: subscription.razorpayCustomerId,
      billingInterval: Number(subscription.billingInterval),
      amountPaise: Number(subscription.amountPaise),
      currency: subscription.currency,
      totalCount: subscription.totalCount,
      paidCount: subscription.paidCount,
      remainingCount: subscription.remainingCount,
      startedAt: subscription.startedAt,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      nextChargeAt: subscription.nextChargeAt,
      cancelAtCycleEnd: Number(subscription.cancelAtCycleEnd) === 1,
      cancelRequestedAt: subscription.cancelRequestedAt,
      cancelledAt: subscription.cancelledAt,
      endedAt: subscription.endedAt,
      shortUrl: subscription.shortUrl,
      createdAt: subscription.createdAt,
    };
  }
}

module.exports = SubscriptionResource;
