const express = require('express');
const AuthController = require('@app/Controllers/V1/User/AuthController');
const validate = require('@app/Middleware/validate');
const rateLimit = require('@app/Middleware/rateLimit');
const authenticate = require('@app/Middleware/authenticate');
const resolveClient = require('@app/Middleware/resolveClient');
const LoginRequest = require('@app/Requests/V1/User/Auth/LoginRequest');
const ForgotPasswordRequest = require('@app/Requests/V1/User/Auth/ForgotPasswordRequest');
const ResetPasswordRequest = require('@app/Requests/V1/User/Auth/ResetPasswordRequest');
const ChangePasswordRequest = require('@app/Requests/V1/User/Auth/ChangePasswordRequest');

const router = express.Router();

// public: no access token needed
router.post('/login', rateLimit({ name: 'user-login', max: Number(process.env.USER_LOGIN_RATE_MAX) || 10 }), validate(LoginRequest), AuthController.login);
router.post('/refresh', rateLimit({ name: 'user-refresh', max: 60 }), AuthController.refresh); // uses the refresh cookie
router.post('/logout', AuthController.logout); // uses the refresh cookie, so it works even when the access token has expired
router.post('/forgot-password', rateLimit({ name: 'user-forgot', windowMs: 15 * 60000, max: 5 }), validate(ForgotPasswordRequest), AuthController.forgotPassword);
router.post('/reset-password', rateLimit({ name: 'user-reset', windowMs: 15 * 60000, max: 10 }), validate(ResetPasswordRequest), AuthController.resetPassword);

// signed in (also allowed while a password change is pending, and without a paid subscription so people can still see why)
router.get('/me', authenticate.allowPasswordChange, resolveClient, AuthController.me);
router.post('/change-password', authenticate.allowPasswordChange, resolveClient, validate(ChangePasswordRequest), AuthController.changePassword);

module.exports = router;
