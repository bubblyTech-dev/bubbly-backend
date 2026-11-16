const express = require('express');
const StudentController = require('@app/Controllers/V1/User/StudentController');
const validate = require('@app/Middleware/validate');
const requirePermission = require('@app/Middleware/requirePermission');
const ListStudentsRequest = require('@app/Requests/V1/User/Students/ListStudentsRequest');
const StoreStudentRequest = require('@app/Requests/V1/User/Students/StoreStudentRequest');
const UpdateStudentRequest = require('@app/Requests/V1/User/Students/UpdateStudentRequest');
const ChangeStudentStatusRequest = require('@app/Requests/V1/User/Students/ChangeStudentStatusRequest');

const router = express.Router();

// /api/v1/user/students  (a Teacher only sees the students of the classes they teach, read only)
router.get('/', requirePermission('students.view'), validate(ListStudentsRequest), StudentController.index);
router.post('/', requirePermission('students.manage'), validate(StoreStudentRequest), StudentController.store);
router.get('/:uuid', requirePermission('students.view'), StudentController.show);
router.patch('/:uuid', requirePermission('students.manage'), validate(UpdateStudentRequest), StudentController.update);
router.patch('/:uuid/status', requirePermission('students.manage'), validate(ChangeStudentStatusRequest), StudentController.changeStatus);
router.post('/:uuid/parent-login', requirePermission('students.manage'), StudentController.parentLogin);
router.delete('/:uuid', requirePermission('students.manage'), StudentController.destroy);

module.exports = router;
