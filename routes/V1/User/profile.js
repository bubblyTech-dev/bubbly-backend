const express = require('express');
const ProfileController = require('@app/Controllers/V1/User/ProfileController');
const validate = require('@app/Middleware/validate');
const requirePermission = require('@app/Middleware/requirePermission');
const UpdateProfileRequest = require('@app/Requests/V1/User/Profile/UpdateProfileRequest');

const router = express.Router();

// /api/v1/user/profile  (every role: own name and phone)
router.get('/', ProfileController.show);
router.patch('/', requirePermission('profile.edit'), validate(UpdateProfileRequest), ProfileController.update);

module.exports = router;
