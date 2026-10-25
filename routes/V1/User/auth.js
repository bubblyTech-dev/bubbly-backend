const express = require('express');
const AuthController = require('@app/Controllers/V1/User/AuthController');

const router = express.Router();

router.post('/login', AuthController.login);

module.exports = router;
