const Response = require('@app/Helpers/Response');
const PermissionService = require('@app/Services/V1/Admin/PermissionService');
const AdminPermissionGroupResource = require('@app/Resources/V1/Admin/AdminPermissionGroupResource');

const PermissionController = {
  // the checklist: every permission grouped by module
  async index(req, res) {
    const groups = await PermissionService.listGrouped();
    return Response.success(res, { data: AdminPermissionGroupResource.collection(groups) });
  },
};

module.exports = PermissionController;
