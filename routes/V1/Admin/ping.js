const express = require('express');
const requirePermission = require('@app/Middleware/requirePermission');

const router = express.Router();

// TEMPORARY demo routes to check the admin middleware (delete this file later)
// /ping            any signed-in admin (the admin group already ran authenticateAdmin)
// /ping-permission only an admin holding dashboard.view (the master always does)
router.get('/ping', (req, res) => res.json({ ok: true, admin: req.admin.email }));
router.get('/ping-permission', requirePermission('dashboard.view'), (req, res) => res.json({ ok: true, permission: 'dashboard.view' }));

module.exports = router;
