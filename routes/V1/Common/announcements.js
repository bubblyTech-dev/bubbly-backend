const express = require('express');
const AnnouncementController = require('@app/Controllers/V1/Common/AnnouncementController');

const router = express.Router();

// GET /api/v1/common/announcements/active  (no login; the public group rate limits it)
router.get('/active', AnnouncementController.active);

module.exports = router;
