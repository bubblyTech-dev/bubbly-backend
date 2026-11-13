const express = require('express');
const SubscriptionController = require('@app/Controllers/V1/User/SubscriptionController');
const requirePermission = require('@app/Middleware/requirePermission');

const router = express.Router();

// GET /api/v1/user/subscription  (Principal only; checkSubscription lets this path through even when payment is overdue)
router.get('/', requirePermission('subscription.view'), SubscriptionController.show);

module.exports = router;
