const Request = require('@app/Requests/Request');

// POST /schools/:uuid/subscriptions
//   planUuid  a published plan that exists on Razorpay
//   startAt   optional, when the first charge should happen (must be in the future)
class StoreSubscriptionRequest extends Request {
  rules() {
    return {
      planUuid: 'required|uuid',
      startAt: 'datetime',
    };
  }

  attributes() {
    return { planUuid: 'plan', startAt: 'start time' };
  }
}

module.exports = StoreSubscriptionRequest;
