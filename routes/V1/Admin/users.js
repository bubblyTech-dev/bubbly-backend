const express = require('express');
const AdminUserController = require('@app/Controllers/V1/Admin/AdminUserController');
const validate = require('@app/Middleware/validate');
const requirePermission = require('@app/Middleware/requirePermission');
const ListAdminUsersRequest = require('@app/Requests/V1/Admin/Users/ListAdminUsersRequest');
const ListPageRequest = require('@app/Requests/V1/Admin/Users/ListPageRequest');
const StoreAdminUserRequest = require('@app/Requests/V1/Admin/Users/StoreAdminUserRequest');
const UpdateAdminUserRequest = require('@app/Requests/V1/Admin/Users/UpdateAdminUserRequest');
const ChangeStatusRequest = require('@app/Requests/V1/Admin/Users/ChangeStatusRequest');
const ResetUserPasswordRequest = require('@app/Requests/V1/Admin/Users/ResetUserPasswordRequest');
const SetPermissionsRequest = require('@app/Requests/V1/Admin/Users/SetPermissionsRequest');

const router = express.Router();

// Staff management (Users & Access). The admin group already ran authenticateAdmin.
router.get('/', requirePermission('users_access.view'), validate(ListAdminUsersRequest), AdminUserController.index);
router.post('/', requirePermission('users_access.create'), validate(StoreAdminUserRequest), AdminUserController.store);

router.get('/:uuid', requirePermission('users_access.view'), AdminUserController.show);
router.patch('/:uuid', requirePermission('users_access.edit'), validate(UpdateAdminUserRequest), AdminUserController.update);
router.delete('/:uuid', requirePermission('users_access.delete'), AdminUserController.destroy);

router.patch('/:uuid/status', requirePermission('users_access.status'), validate(ChangeStatusRequest), AdminUserController.changeStatus);
router.post('/:uuid/reset-password', requirePermission('users_access.reset_password'), validate(ResetUserPasswordRequest), AdminUserController.resetPassword);
router.put('/:uuid/permissions', requirePermission('users_access.permissions'), validate(SetPermissionsRequest), AdminUserController.setPermissions);

router.get('/:uuid/sessions', requirePermission('users_access.sessions'), AdminUserController.sessions);
router.delete('/:uuid/sessions', requirePermission('users_access.sessions'), AdminUserController.revokeAllSessions);
router.delete('/:uuid/sessions/:sessionUuid', requirePermission('users_access.sessions'), AdminUserController.revokeSession);

router.get('/:uuid/login-history', requirePermission('users_access.login_history'), validate(ListPageRequest), AdminUserController.loginHistory);

module.exports = router;
