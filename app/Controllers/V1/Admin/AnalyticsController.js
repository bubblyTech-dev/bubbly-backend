const Response = require('@app/Helpers/Response');
const { clientInfo } = require('@app/Helpers/http');
const AnalyticsService = require('@app/Services/V1/Admin/Analytics/AnalyticsService');

const context = (req) => ({ admin: req.admin, ...clientInfo(req) });

const AnalyticsController = {
  async meta(req, res) {
    return Response.success(res, { data: await AnalyticsService.meta() });
  },

  async catalogue(req, res) {
    return Response.success(res, { data: AnalyticsService.catalogue() });
  },

  // JSON for the page, or a CSV / Excel download when ?format= is given
  async show(req, res) {
    const query = { ...req.validated, plan: req.query.plan, status: req.query.status, source: req.query.source };
    if (req.validated.format) return AnalyticsService.exportFile(res, req.params.key, query, context(req));
    return Response.success(res, { data: await AnalyticsService.show(req.params.key, query, context(req)) });
  },
};

module.exports = AnalyticsController;
