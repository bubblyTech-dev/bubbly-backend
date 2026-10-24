const express = require('express');
const logger = require('@app/Helpers/logger');
const AuthController = require('@app/Controllers/V1/User/AuthController');

const router = express.Router();

router.post('/login', AuthController.login);
logger.ok('routes/V1/User/auth.js  ->  POST /api/v1/user/auth/login');

module.exports = router;
