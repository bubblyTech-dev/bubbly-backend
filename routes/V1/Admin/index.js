const express = require('express');
const { groups } = require('@app/Middleware/groups');

const router = express.Router();

// Admin routes (V1). Auth routes first (login is public; the other auth routes protect themselves),
// then the admin group (authenticateAdmin), then everything else.
router.use('/auth', require('./auth'));

router.use(groups.admin);
router.use('/files', require('./files'));
// plans and modules
router.use('/plans', require('./plans'));
router.use('/modules', require('./modules'));
router.use('/profile', require('./profile'));
router.use('/users', require('./users'));
router.use('/permissions', require('./permissions'));
router.use('/audit-logs', require('./auditLogs'));
router.use('/settings', require('./settings'));
router.use('/schools/:uuid/principal', require('./schoolPrincipal'));
router.use('/schools', require('./schools'));
router.use('/notifications', require('./notifications'));
router.use('/subscriptions', require('./subscriptions'));
router.use('/renewals', require('./renewals'));
router.use('/payments', require('./offlinePayments')); // record an offline payment (matched before the billing router)
router.use(require('./billing')); // webhook events, payments and invoices
router.use('/inquiries', require('./inquiries'));
// development helpers (the webhook replay): never available in production
if (process.env.NODE_ENV !== 'production') router.use('/dev', require('./dev'));
router.use('/announcements', require('./announcements'));
// add one file per feature below, e.g. router.use('/clients', require('./client'));

module.exports = router;
