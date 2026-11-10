const express = require('express');
const RenewalController = require('@app/Controllers/V1/Admin/RenewalController');
const requirePermission = require('@app/Middleware/requirePermission');
const validate = require('@app/Middleware/validate');
const ListRenewalsRequest = require('@app/Requests/V1/Admin/Renewals/ListRenewalsRequest');

const router = express.Router();

// /api/v1/admin/renewals  (the admin group already ran authenticateAdmin)
router.get('/counts', requirePermission('renewals.view'), RenewalController.counts);
router.get('/', requirePermission('renewals.view'), validate(ListRenewalsRequest), RenewalController.index);

module.exports = router;
