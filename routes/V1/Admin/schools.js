const express = require('express');
const SchoolController = require('@app/Controllers/V1/Admin/SchoolController');
const requirePermission = require('@app/Middleware/requirePermission');
const validate = require('@app/Middleware/validate');
const ListSchoolsRequest = require('@app/Requests/V1/Admin/Schools/ListSchoolsRequest');
const ListPageRequest = require('@app/Requests/V1/Admin/Schools/ListPageRequest');
const StoreSchoolRequest = require('@app/Requests/V1/Admin/Schools/StoreSchoolRequest');
const UpdateSchoolRequest = require('@app/Requests/V1/Admin/Schools/UpdateSchoolRequest');
const ChangeStatusRequest = require('@app/Requests/V1/Admin/Schools/ChangeStatusRequest');
const StoreNoteRequest = require('@app/Requests/V1/Admin/Schools/StoreNoteRequest');

const router = express.Router();

// /api/v1/admin/schools  (the admin group already ran authenticateAdmin)
router.get('/', requirePermission('schools.view'), validate(ListSchoolsRequest), SchoolController.index);
router.post('/', requirePermission('schools.create'), validate(StoreSchoolRequest), SchoolController.store);

router.get('/:uuid', requirePermission('schools.view'), SchoolController.show);
router.patch('/:uuid', requirePermission('schools.edit'), validate(UpdateSchoolRequest), SchoolController.update);
router.delete('/:uuid', requirePermission('schools.delete'), SchoolController.destroy);

router.post('/:uuid/status', requirePermission('schools.status'), validate(ChangeStatusRequest), SchoolController.changeStatus);
router.get('/:uuid/status-history', requirePermission('schools.view'), validate(ListPageRequest), SchoolController.statusHistory);

router.get('/:uuid/notes', requirePermission('schools.notes'), validate(ListPageRequest), SchoolController.notes);
router.post('/:uuid/notes', requirePermission('schools.notes'), validate(StoreNoteRequest), SchoolController.addNote);

router.get('/:uuid/usage', requirePermission('schools.usage'), SchoolController.usage);

module.exports = router;
