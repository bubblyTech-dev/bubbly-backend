const Response = require('@app/Helpers/Response');
const PlanService = require('@app/Services/V1/Common/PlanService');

const PlanController = {
  // public pricing page: published plans only
  async index(req, res) {
    return Response.success(res, { data: { plans: await PlanService.listPublished() } });
  },
};

module.exports = PlanController;
