const Response = require('@app/Helpers/Response');
const { clientInfo } = require('@app/Helpers/http');
const PrincipalService = require('@app/Services/V1/Admin/PrincipalService');

const contextOf = (req) => ({ admin: req.admin, ...clientInfo(req) });

const PrincipalController = {
  async show(req, res) {
    return Response.success(res, { data: { principal: await PrincipalService.summary(req.params.uuid) } });
  },

  async resendWelcome(req, res) {
    const principal = await PrincipalService.resendWelcome(req.params.uuid, contextOf(req));
    return Response.success(res, { data: { principal }, message: 'A new welcome link was created.' });
  },

  async resetPassword(req, res) {
    const principal = await PrincipalService.resetPassword(req.params.uuid, contextOf(req));
    return Response.success(res, { data: { principal }, message: 'The Principal password was reset.' });
  },
};

module.exports = PrincipalController;
