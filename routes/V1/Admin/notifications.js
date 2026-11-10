const express = require('express');
const NotificationController = require('@app/Controllers/V1/Admin/NotificationController');

// /api/v1/admin/notifications  (any signed-in admin; what they see depends on their permissions and the settings)
const router = express.Router();

router.get('/', NotificationController.index);
router.post('/seen', NotificationController.seen);

module.exports = router;
