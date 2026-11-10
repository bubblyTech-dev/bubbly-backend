const express = require('express');
const DevController = require('@app/Controllers/V1/Admin/DevController');
const validate = require('@app/Middleware/validate');
const ReplayWebhookRequest = require('@app/Requests/V1/Admin/Billing/ReplayWebhookRequest');

const router = express.Router();

// DEVELOPMENT ONLY: mounted at /api/v1/admin/dev when NODE_ENV is not "production". Master admin only.
router.post('/webhook-replay', validate(ReplayWebhookRequest), DevController.webhookReplay);

module.exports = router;
