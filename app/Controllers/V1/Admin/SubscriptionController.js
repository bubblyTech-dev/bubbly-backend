const Response = require('@app/Helpers/Response');
const { clientInfo } = require('@app/Helpers/http');
const SubscriptionService = require('@app/Services/V1/Admin/SubscriptionService');

// who is acting and from where, for the audit log
const contextOf = (req) => ({ admin: req.admin, ...clientInfo(req) });

const SubscriptionController = {
  async index(req, res) {
    const result = await SubscriptionService.list(req.validated);
    return Response.success(res, { data: result.data, meta: result.meta });
  },

  async show(req, res) {
    return Response.success(res, { data: { subscription: await SubscriptionService.show(req.params.uuid) } });
  },

  // GET /schools/:uuid/subscriptions
  async forSchool(req, res) {
    return Response.success(res, { data: { subscriptions: await SubscriptionService.listForSchool(req.params.uuid) } });
  },

  // POST /schools/:uuid/subscriptions
  async storeForSchool(req, res) {
    const subscription = await SubscriptionService.createForSchool(req.params.uuid, req.validated, contextOf(req));
    return Response.created(res, { data: { subscription }, message: 'Subscription created. Share the payment link with the school.' });
  },

  async cancel(req, res) {
    const subscription = await SubscriptionService.cancel(req.params.uuid, contextOf(req));
    return Response.success(res, { data: { subscription }, message: 'Cancellation saved.' });
  },

  async sync(req, res) {
    const subscription = await SubscriptionService.sync(req.params.uuid, contextOf(req));
    return Response.success(res, { data: { subscription }, message: 'Refreshed from Razorpay.' });
  },
};

module.exports = SubscriptionController;
