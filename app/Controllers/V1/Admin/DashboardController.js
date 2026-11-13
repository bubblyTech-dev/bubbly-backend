const Response = require('@app/Helpers/Response');
const DashboardService = require('@app/Services/V1/Admin/DashboardService');
const DashboardResource = require('@app/Resources/V1/Admin/DashboardResource');

const DashboardController = {
  async show(req, res) {
    const data = await DashboardService.build(req.admin, req.validated);
    return Response.success(res, { data: DashboardResource.make(data) });
  },
};

module.exports = DashboardController;
