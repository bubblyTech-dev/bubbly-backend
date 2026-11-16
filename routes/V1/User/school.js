const express = require('express');
const SchoolController = require('@app/Controllers/V1/User/SchoolController');
const validate = require('@app/Middleware/validate');
const requirePermission = require('@app/Middleware/requirePermission');
const UpdateSchoolRequest = require('@app/Requests/V1/User/School/UpdateSchoolRequest');

const router = express.Router();

// /api/v1/user/school  (Principal: school details, settings, plan and usage)
router.get('/', requirePermission('school.manage'), SchoolController.show);
router.patch('/', requirePermission('school.manage'), validate(UpdateSchoolRequest), SchoolController.update);

module.exports = router;
