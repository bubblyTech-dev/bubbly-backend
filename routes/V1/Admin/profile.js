const express = require('express');
const ProfileController = require('@app/Controllers/V1/Admin/ProfileController');
const validate = require('@app/Middleware/validate');
const UpdateProfileRequest = require('@app/Requests/V1/Admin/Profile/UpdateProfileRequest');

const router = express.Router();

// the logged-in admin edits their own profile (no extra permission needed)
router.patch('/', validate(UpdateProfileRequest), ProfileController.update);

module.exports = router;
