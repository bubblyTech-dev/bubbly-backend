const Response = require('@app/Helpers/Response');
const AuditLogService = require('@app/Services/V1/Admin/AuditLogService');

const AuditLogController = {
  async index(req, res) {
    const { data, meta } = await AuditLogService.list(req.admin, req.validated);
    return Response.success(res, { data, meta });
  },
};

module.exports = AuditLogController;
