const express = require('express');
const ReportController = require('@app/Controllers/V1/Admin/ReportController');
const rateLimit = require('@app/Middleware/rateLimit');
const requirePermission = require('@app/Middleware/requirePermission');
const requireExportPermission = require('@app/Middleware/requireExportPermission');
const validate = require('@app/Middleware/validate');
const ReportQueryRequest = require('@app/Requests/V1/Admin/Reports/ReportQueryRequest');

const router = express.Router();

// /api/v1/admin/reports  (the admin group already ran authenticateAdmin)
router.get('/', requirePermission('reports.view'), ReportController.catalogue);
router.get(
  '/:key',
  rateLimit({ name: 'admin-reports', max: 120 }),
  requirePermission('reports.view'),
  validate(ReportQueryRequest),
  requireExportPermission,
  ReportController.show,
);

module.exports = router;
