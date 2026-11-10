const Resource = require('@app/Resources/Resource');

const DAY = 86400000;

// what the key date of each tab means
const DATE_LABELS = {
  due_soon: 'Next charge',
  payment_failed: 'Failed on',
  in_grace: 'Grace ends',
  suspended: 'Suspended on',
};

// One row of the Renewals page.
//   RenewalResource.collection(rows, { tab, now, graceDays })
// daysLeft: days until the date (negative = days past it) for Due soon and In grace;
// for Payment failed and Suspended it is the number of days since the date, shown as a negative number.
class RenewalResource extends Resource {
  toArray() {
    const subscription = this.resource;
    const { tab, now, graceDays } = this.extra;

    const pastDueAt = subscription.pastDueSince || subscription.updatedAt;
    let keyDate;

    if (tab === 'due_soon') keyDate = subscription.nextChargeAt || subscription.currentPeriodEnd;
    else if (tab === 'in_grace') keyDate = new Date(new Date(pastDueAt).getTime() + graceDays * DAY);
    else keyDate = pastDueAt; // payment_failed and suspended: when it happened

    const days = keyDate ? Math.ceil((new Date(keyDate).getTime() - now.getTime()) / DAY) : null;

    return {
      uuid: subscription.uuid,
      status: Number(subscription.status),
      school: subscription.client ? { uuid: subscription.client.uuid, name: subscription.client.name } : null,
      plan: subscription.plan ? { uuid: subscription.plan.uuid, name: subscription.plan.name } : null,
      amountPaise: Number(subscription.amountPaise),
      currency: subscription.currency,
      // 1: Razorpay, 2: Offline (a subscription without Razorpay ids was recorded by hand)
      source: Number(subscription.source ?? (subscription.razorpaySubscriptionId ? 1 : 2)),
      razorpaySubscriptionId: subscription.razorpaySubscriptionId,
      cancelAtCycleEnd: Number(subscription.cancelAtCycleEnd) === 1,
      dateLabel: DATE_LABELS[tab],
      date: keyDate,
      daysLeft: days,
      currentPeriodEnd: subscription.currentPeriodEnd,
      nextChargeAt: subscription.nextChargeAt,
    };
  }
}

module.exports = RenewalResource;
