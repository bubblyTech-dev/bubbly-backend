const Response = require('@app/Helpers/Response');
const SubscriptionAccess = require('@app/Services/V1/Common/SubscriptionAccess');
const SubscriptionSummaryResource = require('@app/Resources/V1/User/SubscriptionSummaryResource');

const SubscriptionController = {
  // the school's own plan and status (the Principal can open this even when the subscription is not active)
  async show(req, res) {
    const access = await SubscriptionAccess.forClient(req.client.id);
    return Response.success(res, { data: { subscription: SubscriptionSummaryResource.make(access) } });
  },
};

module.exports = SubscriptionController;
