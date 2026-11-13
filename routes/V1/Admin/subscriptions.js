const express = require('express');
const SubscriptionController = require('@app/Controllers/V1/Admin/SubscriptionController');
const requirePermission = require('@app/Middleware/requirePermission');
const validate = require('@app/Middleware/validate');
const ChangeExpiryRequest = require('@app/Requests/V1/Admin/Billing/ChangeExpiryRequest');
const OfflinePaymentController = require('@app/Controllers/V1/Admin/OfflinePaymentController');
const ListSubscriptionsRequest = require('@app/Requests/V1/Admin/Subscriptions/ListSubscriptionsRequest');

const router = express.Router();

// /api/v1/admin/subscriptions  (the admin group already ran authenticateAdmin)
// Subscriptions are created from a school: POST /api/v1/admin/schools/:uuid/subscriptions
router.get('/', requirePermission('subscriptions.view'), validate(ListSubscriptionsRequest), SubscriptionController.index);
router.get('/:uuid', requirePermission('subscriptions.view'), SubscriptionController.show);
router.post('/:uuid/cancel', requirePermission('subscriptions.manage'), SubscriptionController.cancel);
router.post('/:uuid/expiry', requirePermission('subscriptions.manage'), validate(ChangeExpiryRequest), OfflinePaymentController.changeExpiry);
router.post('/:uuid/sync', requirePermission('subscriptions.manage'), SubscriptionController.sync);

module.exports = router;
