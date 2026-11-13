const express = require('express');
const PrincipalController = require('@app/Controllers/V1/Admin/PrincipalController');
const requirePermission = require('@app/Middleware/requirePermission');
const rateLimit = require('@app/Middleware/rateLimit');

// /api/v1/admin/schools/:uuid/principal  (mounted before /schools so the school routes never see these paths)
const router = express.Router({ mergeParams: true });

router.get('/', requirePermission('schools.view'), PrincipalController.show);
router.post('/resend-welcome', requirePermission('schools.edit'), rateLimit({ name: 'admin-principal', max: 10 }), PrincipalController.resendWelcome);
router.post('/reset-password', requirePermission('schools.edit'), rateLimit({ name: 'admin-principal', max: 10 }), PrincipalController.resetPassword);

module.exports = router;
