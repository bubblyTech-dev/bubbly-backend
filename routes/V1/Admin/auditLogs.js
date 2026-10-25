const express = require('express');
const AuditLogController = require('@app/Controllers/V1/Admin/AuditLogController');
const validate = require('@app/Middleware/validate');
const requirePermission = require('@app/Middleware/requirePermission');
const ListAuditLogsRequest = require('@app/Requests/V1/Admin/Audit/ListAuditLogsRequest');

const router = express.Router();

router.get('/', requirePermission('audit.view'), validate(ListAuditLogsRequest), AuditLogController.index);

module.exports = router;
