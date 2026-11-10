const Response = require('@app/Helpers/Response');
const RenewalService = require('@app/Services/V1/Admin/RenewalService');

const RenewalController = {
  async index(req, res) {
    const result = await RenewalService.list(req.validated);
    return Response.success(res, { data: result.data, meta: result.meta });
  },

  async counts(req, res) {
    return Response.success(res, { data: await RenewalService.counts() });
  },
};

module.exports = RenewalController;
