const Response = require('@app/Helpers/Response');
const { clientInfo } = require('@app/Helpers/http');
const ReportService = require('@app/Services/V1/Admin/Reports/ReportService');

const context = (req) => ({ admin: req.admin, ...clientInfo(req) });

const ReportController = {
  async catalogue(req, res) {
    return Response.success(res, { data: ReportService.catalogue() });
  },

  // JSON for the preview table, or a CSV / Excel download when ?format= is given
  async show(req, res) {
    const query = { ...req.validated, filtersRaw: req.query };
    if (req.validated.format) return ReportService.exportFile(res, req.params.key, query, context(req));

    const result = await ReportService.show(req.params.key, query, context(req));
    return Response.success(res, { data: { report: result.report, range: result.range, filtersText: result.filtersText, rows: result.rows, totals: result.totals }, meta: result.meta });
  },
};

module.exports = ReportController;
