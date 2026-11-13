const express = require('express');
const DashboardController = require('@app/Controllers/V1/Admin/DashboardController');
const rateLimit = require('@app/Middleware/rateLimit');
const requirePermission = require('@app/Middleware/requirePermission');
const validate = require('@app/Middleware/validate');
const DashboardQueryRequest = require('@app/Requests/V1/Admin/Dashboard/DashboardQueryRequest');

const router = express.Router();

// GET /api/v1/admin/dashboard  (the admin group already ran authenticateAdmin). Each block also needs the permission of its source.
router.get('/', rateLimit({ name: 'admin-dashboard', max: 120 }), requirePermission('dashboard.view'), validate(DashboardQueryRequest), DashboardController.show);

module.exports = router;
