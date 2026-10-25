const express = require('express');
const PermissionController = require('@app/Controllers/V1/Admin/PermissionController');
const requirePermission = require('@app/Middleware/requirePermission');

const router = express.Router();

router.get('/', requirePermission('users_access.view'), PermissionController.index);

module.exports = router;
