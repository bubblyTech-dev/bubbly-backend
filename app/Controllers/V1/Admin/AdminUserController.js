const Response = require('@app/Helpers/Response');
const { clientInfo } = require('@app/Helpers/http');
const AdminUserService = require('@app/Services/V1/Admin/AdminUserService');

// who is acting and from where, for the audit log
const context = (req) => {
  const { ip, userAgent } = clientInfo(req);
  return { admin: req.admin, ip, userAgent };
};

const AdminUserController = {
  async index(req, res) {
    const { data, meta } = await AdminUserService.list(req.validated);
    return Response.success(res, { data, meta });
  },

  async show(req, res) {
    return Response.success(res, { data: { user: await AdminUserService.show(req.params.uuid) } });
  },

  async store(req, res) {
    const user = await AdminUserService.create(req.admin, context(req), req.validated);
    return Response.created(res, { data: { user }, message: 'Staff member added.' });
  },

  async update(req, res) {
    const user = await AdminUserService.update(req.admin, context(req), req.params.uuid, req.validated);
    return Response.success(res, { data: { user }, message: 'Staff member updated.' });
  },

  async changeStatus(req, res) {
    const user = await AdminUserService.changeStatus(req.admin, context(req), req.params.uuid, req.validated);
    return Response.success(res, { data: { user }, message: 'Status updated.' });
  },

  async resetPassword(req, res) {
    await AdminUserService.resetPassword(req.admin, context(req), req.params.uuid, req.validated);
    return Response.success(res, { message: 'Password updated. The staff member must change it at the next login.' });
  },

  async setPermissions(req, res) {
    const user = await AdminUserService.setPermissions(req.admin, context(req), req.params.uuid, req.validated);
    return Response.success(res, { data: { user }, message: 'Permissions updated.' });
  },

  async destroy(req, res) {
    await AdminUserService.remove(req.admin, context(req), req.params.uuid);
    return Response.success(res, { message: 'Staff member removed.' });
  },

  async sessions(req, res) {
    return Response.success(res, { data: await AdminUserService.listSessions(req.params.uuid) });
  },

  async revokeSession(req, res) {
    await AdminUserService.revokeSession(req.admin, context(req), req.params.uuid, req.params.sessionUuid);
    return Response.success(res, { message: 'Session ended.' });
  },

  async revokeAllSessions(req, res) {
    await AdminUserService.revokeAllSessions(req.admin, context(req), req.params.uuid);
    return Response.success(res, { message: 'All sessions ended.' });
  },

  async loginHistory(req, res) {
    const { data, meta } = await AdminUserService.loginHistory(req.params.uuid, req.validated);
    return Response.success(res, { data, meta });
  },
};

module.exports = AdminUserController;
