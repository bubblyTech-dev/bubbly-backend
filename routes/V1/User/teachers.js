const express = require('express');
const TeacherController = require('@app/Controllers/V1/User/TeacherController');
const validate = require('@app/Middleware/validate');
const requirePermission = require('@app/Middleware/requirePermission');
const ListTeachersRequest = require('@app/Requests/V1/User/Teachers/ListTeachersRequest');
const StoreTeacherRequest = require('@app/Requests/V1/User/Teachers/StoreTeacherRequest');
const UpdateTeacherRequest = require('@app/Requests/V1/User/Teachers/UpdateTeacherRequest');
const ChangeTeacherStatusRequest = require('@app/Requests/V1/User/Teachers/ChangeTeacherStatusRequest');
const MarkStaffAttendanceRequest = require('@app/Requests/V1/User/Teachers/MarkStaffAttendanceRequest');

const router = express.Router();

// /api/v1/user/teachers  (Principal)
router.get('/', requirePermission('teachers.view'), validate(ListTeachersRequest), TeacherController.index);
router.get('/options', requirePermission('teachers.view'), TeacherController.options);
router.post('/', requirePermission('teachers.manage'), validate(StoreTeacherRequest), TeacherController.store);
router.get('/:uuid', requirePermission('teachers.view'), TeacherController.show);
router.patch('/:uuid', requirePermission('teachers.manage'), validate(UpdateTeacherRequest), TeacherController.update);
router.patch('/:uuid/status', requirePermission('teachers.manage'), validate(ChangeTeacherStatusRequest), TeacherController.changeStatus);
router.post('/:uuid/login-link', requirePermission('teachers.manage'), TeacherController.sendLoginLink);
router.put('/:uuid/attendance', requirePermission('staff_attendance.mark'), validate(MarkStaffAttendanceRequest), TeacherController.markAttendance);

module.exports = router;
