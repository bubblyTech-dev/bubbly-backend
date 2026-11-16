const express = require('express');
const ClassController = require('@app/Controllers/V1/User/ClassController');
const validate = require('@app/Middleware/validate');
const requirePermission = require('@app/Middleware/requirePermission');
const ListClassesRequest = require('@app/Requests/V1/User/Classes/ListClassesRequest');
const StoreClassRequest = require('@app/Requests/V1/User/Classes/StoreClassRequest');
const UpdateClassRequest = require('@app/Requests/V1/User/Classes/UpdateClassRequest');

const router = express.Router();

// /api/v1/user/classes  (a Teacher only sees the classes they teach)
router.get('/', requirePermission('classes.view'), validate(ListClassesRequest), ClassController.index);
router.get('/options', requirePermission('classes.view'), ClassController.options);
router.post('/', requirePermission('classes.manage'), validate(StoreClassRequest), ClassController.store);
router.get('/:uuid', requirePermission('classes.view'), ClassController.show);
router.patch('/:uuid', requirePermission('classes.manage'), validate(UpdateClassRequest), ClassController.update);
router.delete('/:uuid', requirePermission('classes.manage'), ClassController.destroy);

module.exports = router;
