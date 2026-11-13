const express = require('express');
const AnalyticsController = require('@app/Controllers/V1/Admin/AnalyticsController');
const rateLimit = require('@app/Middleware/rateLimit');
const requirePermission = require('@app/Middleware/requirePermission');
const requireExportPermission = require('@app/Middleware/requireExportPermission');
const validate = require('@app/Middleware/validate');
const AnalyticsQueryRequest = require('@app/Requests/V1/Admin/Analytics/AnalyticsQueryRequest');

const router = express.Router();

// /api/v1/admin/analytics  (the admin group already ran authenticateAdmin)
router.get('/meta', requirePermission('reports.view'), AnalyticsController.meta);
router.get('/', requirePermission('reports.view'), AnalyticsController.catalogue);
router.get(
  '/:key',
  rateLimit({ name: 'admin-analytics', max: 120 }),
  requirePermission('reports.view'),
  validate(AnalyticsQueryRequest),
  requireExportPermission,
  AnalyticsController.show,
);

module.exports = router;
