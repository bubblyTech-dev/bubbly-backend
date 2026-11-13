const express = require('express');
const SettingController = require('@app/Controllers/V1/Admin/SettingController');
const requirePermission = require('@app/Middleware/requirePermission');
const validate = require('@app/Middleware/validate');
const UpdateSettingsRequest = require('@app/Requests/V1/Admin/Settings/UpdateSettingsRequest');

const router = express.Router();

router.get('/', requirePermission('settings.view'), SettingController.index);
router.put('/:group', requirePermission('settings.edit'), validate(UpdateSettingsRequest), SettingController.update);

module.exports = router;
