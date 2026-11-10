const Response = require('@app/Helpers/Response');
const { clientInfo } = require('@app/Helpers/http');
const AppError = require('@app/Helpers/AppError');
const BillingQueryService = require('@app/Services/V1/Admin/BillingQueryService');
const InvoicePdfService = require('@app/Services/V1/Admin/InvoicePdfService');
const PaymentRefundService = require('@app/Services/V1/Admin/PaymentRefundService');
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

  async refundOptions(req, res) {
    return Response.success(res, { data: await PaymentRefundService.options() });
  },

  async refund(req, res) {
    const result = await PaymentRefundService.refund(req.params.uuid, req.validated, contextOf(req));
    return Response.success(res, {
      message: result.warning ? 'Refund recorded. See the note.' : 'Refund recorded.',
      data: { payment: result.payment, warning: result.warning },
    });
  },

  async invoices(req, res) {
    const result = await BillingQueryService.listInvoices(req.validated);
    return Response.success(res, { data: result.data, meta: result.meta });
  },

  // sends the invoice as a PDF download; ?refresh=1 (master only) makes the file again
  async invoicePdf(req, res) {
    const refresh = ['1', 'true'].includes(String(req.query.refresh || ''));
    if (refresh && !req.admin.isMaster) throw AppError.forbidden();

    const { invoice, stream } = await InvoicePdfService.download(req.params.uuid, contextOf(req), { refresh });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${String(invoice.invoiceNo).replace(/[^A-Za-z0-9._-]/g, '_')}.pdf"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  },

  async showInvoice(req, res) {
    return Response.success(res, { data: { invoice: await BillingQueryService.showInvoice(req.params.uuid) } });
  },
};

module.exports = BillingController;
