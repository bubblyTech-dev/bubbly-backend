const Response = require('@app/Helpers/Response');
const { clientInfo } = require('@app/Helpers/http');
const OfflinePaymentService = require('@app/Services/V1/Admin/OfflinePaymentService');

const contextOf = (req) => ({ admin: req.admin, ...clientInfo(req) });

const OfflinePaymentController = {
  async options(req, res) {
    return Response.success(res, { data: await OfflinePaymentService.options() });
  },

  async store(req, res) {
    const result = await OfflinePaymentService.record(contextOf(req), req.validated);
    return Response.created(res, { data: result, message: 'Offline payment recorded.' });
  },

  async changeExpiry(req, res) {
    const subscription = await OfflinePaymentService.changeExpiry(req.params.uuid, req.validated, contextOf(req));
    return Response.success(res, { data: { subscription }, message: 'Expiry date changed.' });
  },
};

module.exports = OfflinePaymentController;
