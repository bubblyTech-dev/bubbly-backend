const express = require('express');
const DashboardController = require('@app/Controllers/V1/User/DashboardController');
const requireRole = require('@app/Middleware/requireRole');
const { USER_ROLE } = require('@app/Helpers/constants');

const router = express.Router();

// /api/v1/user/dashboard/principal
router.get('/principal', requireRole(USER_ROLE.PRINCIPAL), DashboardController.principal);

module.exports = router;
