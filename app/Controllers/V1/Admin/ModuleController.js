const Response = require('@app/Helpers/Response');
const { clientInfo } = require('@app/Helpers/http');
const ModuleService = require('@app/Services/V1/Admin/ModuleService');

const ModuleController = {
  async index(req, res) {
    return Response.success(res, { data: { modules: await ModuleService.list() } });
  },

  async update(req, res) {
    const module = await ModuleService.update({ admin: req.admin, ...clientInfo(req) }, req.params.uuid, req.validated);
    return Response.success(res, { data: { module }, message: 'Module updated.' });
  },
};

module.exports = ModuleController;
