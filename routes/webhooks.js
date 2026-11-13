const express = require('express');
const WebhookController = require('@app/Controllers/V1/Common/WebhookController');

const router = express.Router();

// POST /api/webhooks/payment  (the body arrives raw, see index.js)
router.post('/payment', WebhookController.payment);

module.exports = router;
