const Response = require('@app/Helpers/Response');
const School = require('@app/Helpers/school');
const DashboardService = require('@app/Services/V1/User/DashboardService');

const DashboardController = {
  async principal(req, res) {
    return Response.success(res, { data: await DashboardService.principal(School.ctx(req)) });
  },
};

module.exports = DashboardController;
