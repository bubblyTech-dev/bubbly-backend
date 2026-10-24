const express = require('express');
const logger = require('@app/Helpers/logger');
const AuthController = require('@app/Controllers/V1/Admin/AuthController');

const router = express.Router();

router.post('/login', AuthController.login);
logger.ok('routes/V1/Admin/auth.js  ->  POST /api/v1/admin/auth/login');

module.exports = router;
