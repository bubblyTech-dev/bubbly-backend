const Response = require('@app/Helpers/Response');
const { clientInfo } = require('@app/Helpers/http');
const BillingQueryService = require('@app/Services/V1/Admin/BillingQueryService');
const WebhookIngest = require('@app/Services/V1/Common/Webhooks/WebhookIngest');
const WebhookEventResource = require('@app/Resources/V1/Admin/WebhookEventResource');

const contextOf = (req) => ({ admin: req.admin, ...clientInfo(req) });

const BillingController = {
  async events(req, res) {
    const result = await BillingQueryService.listEvents(req.validated);
    return Response.success(res, { data: result.data, meta: result.meta });
  },

  async showEvent(req, res) {
    return Response.success(res, { data: { event: await BillingQueryService.showEvent(req.params.uuid) } });
  },

  async reprocessEvent(req, res) {
    const result = await WebhookIngest.reprocess(req.params.uuid, contextOf(req));
    return Response.success(res, {
      message: result.outcome === 'failed' ? 'The event failed again. See the error on the event.' : 'The event was processed.',
      data: { outcome: result.outcome, event: WebhookEventResource.make(result.event) },
    });
  },

  async payments(req, res) {
    const result = await BillingQueryService.listPayments(req.validated);
    return Response.success(res, { data: result.data, meta: result.meta });
  },

  async showPayment(req, res) {
    return Response.success(res, { data: { payment: await BillingQueryService.showPayment(req.params.uuid) } });
  },

  async invoices(req, res) {
    const result = await BillingQueryService.listInvoices(req.validated);
    return Response.success(res, { data: result.data, meta: result.meta });
  },

  async showInvoice(req, res) {
    return Response.success(res, { data: { invoice: await BillingQueryService.showInvoice(req.params.uuid) } });
  },
};

module.exports = BillingController;
