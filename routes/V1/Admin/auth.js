const express = require('express');
const AuthController = require('@app/Controllers/V1/Admin/AuthController');
const validate = require('@app/Middleware/validate');
const rateLimit = require('@app/Middleware/rateLimit');
const authenticateAdmin = require('@app/Middleware/authenticateAdmin');
const LoginRequest = require('@app/Requests/V1/Admin/Auth/LoginRequest');
const ForgotPasswordRequest = require('@app/Requests/V1/Admin/Auth/ForgotPasswordRequest');
const ResetPasswordRequest = require('@app/Requests/V1/Admin/Auth/ResetPasswordRequest');
const ChangePasswordRequest = require('@app/Requests/V1/Admin/Auth/ChangePasswordRequest');

const router = express.Router();

// public: no access token needed
router.post('/login', rateLimit({ name: 'admin-login', max: Number(process.env.ADMIN_LOGIN_RATE_MAX) || 10 }), validate(LoginRequest), AuthController.login);
router.post('/refresh', rateLimit({ name: 'admin-refresh', max: 60 }), AuthController.refresh); // uses the refresh cookie
router.post('/logout', AuthController.logout); // uses the refresh cookie, so it works even when the access token has expired
router.post('/forgot-password', rateLimit({ name: 'admin-forgot', windowMs: 15 * 60000, max: 5 }), validate(ForgotPasswordRequest), AuthController.forgotPassword);
router.post('/reset-password', rateLimit({ name: 'admin-reset', windowMs: 15 * 60000, max: 10 }), validate(ResetPasswordRequest), AuthController.resetPassword);

// signed in (also allowed while a password change is still pending)
router.get('/me', authenticateAdmin.allowPasswordChange, AuthController.me);
router.post('/change-password', authenticateAdmin.allowPasswordChange, validate(ChangePasswordRequest), AuthController.changePassword);


module.exports = router;
