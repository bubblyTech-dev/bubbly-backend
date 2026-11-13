const Response = require('@app/Helpers/Response');
const { clientInfo } = require('@app/Helpers/http');
const EntitlementService = require('@app/Services/V1/Admin/EntitlementService');

const contextOf = (req) => ({ admin: req.admin, ...clientInfo(req) });

const EntitlementController = {
  async show(req, res) {
    return Response.success(res, { data: await EntitlementService.show(req.params.uuid) });
  },

  async setModule(req, res) {
    const data = await EntitlementService.setModule(contextOf(req), req.params.uuid, req.params.moduleUuid, req.validated);
    return Response.success(res, { data, message: 'Module access saved.' });
  },

  async clearModule(req, res) {
    const data = await EntitlementService.clearModule(contextOf(req), req.params.uuid, req.params.moduleUuid, req.validated);
    return Response.success(res, { data, message: 'Back to the plan default.' });
  },

  async setLimit(req, res) {
    const data = await EntitlementService.setLimit(contextOf(req), req.params.uuid, req.params.limitKey, req.validated);
    return Response.success(res, { data, message: 'Limit saved.' });
  },

  async clearLimit(req, res) {
    const data = await EntitlementService.clearLimit(contextOf(req), req.params.uuid, req.params.limitKey, req.validated);
    return Response.success(res, { data, message: 'Back to the plan limit.' });
  },
};

module.exports = EntitlementController;
