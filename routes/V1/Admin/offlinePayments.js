const express = require('express');
const OfflinePaymentController = require('@app/Controllers/V1/Admin/OfflinePaymentController');
const requirePermission = require('@app/Middleware/requirePermission');
const validate = require('@app/Middleware/validate');
const RecordOfflinePaymentRequest = require('@app/Requests/V1/Admin/Billing/RecordOfflinePaymentRequest');

const router = express.Router();

// Mounted at /payments BEFORE the billing router, so these two paths are matched first; every other /payments path
// falls through to the billing router (the list and detail pages).
router.get('/offline-options', requirePermission('billing.record_payment'), OfflinePaymentController.options);
router.post('/offline', requirePermission('billing.record_payment'), validate(RecordOfflinePaymentRequest), OfflinePaymentController.store);

module.exports = router;
