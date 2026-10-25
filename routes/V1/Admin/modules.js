const express = require('express');
const ModuleController = require('@app/Controllers/V1/Admin/ModuleController');
const validate = require('@app/Middleware/validate');
const requirePermission = require('@app/Middleware/requirePermission');
const UpdateModuleRequest = require('@app/Requests/V1/Admin/Modules/UpdateModuleRequest');

const router = express.Router();

router.get('/', requirePermission('modules.view'), ModuleController.index);
router.patch('/:uuid', requirePermission('modules.edit'), validate(UpdateModuleRequest), ModuleController.update);

module.exports = router;
