const Response = require('@app/Helpers/Response');
const { clientInfo } = require('@app/Helpers/http');
const SettingService = require('@app/Services/V1/Admin/SettingService');
const SettingGroupResource = require('@app/Resources/V1/Admin/SettingGroupResource');

const SettingController = {
  async index(req, res) {
    return Response.success(res, { data: SettingGroupResource.collection(await SettingService.index()) });
  },

  async update(req, res) {
    const ctx = { admin: req.admin, ...clientInfo(req) };
    const group = await SettingService.updateGroup(ctx, req.params.group, req.validated);
    return Response.success(res, { data: SettingGroupResource.make(group), message: 'Settings saved.' });
  },
};

module.exports = SettingController;
