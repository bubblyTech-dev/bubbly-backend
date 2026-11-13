const { Op } = require('sequelize');
const AppError = require('@app/Helpers/AppError');
const { verifyAdminAccess } = require('@app/Helpers/token');
const { AdminUser, AdminSession } = require('@app/Models');
const { ADMIN_TYPE, ADMIN_STATUS, YES } = require('@app/Helpers/constants');
const PermissionService = require('@app/Services/V1/Admin/PermissionService');

// Checks the access token, then that the session is still alive (so "log out" and "revoke" work immediately)
// and the account is still active. On success: req.admin = { uuid, name, email, isMaster, permissions, ... }.
//
//   router.get('/x', authenticateAdmin, handler)                         normal use
//   router.get('/me', authenticateAdmin.allowPasswordChange, handler)    also allowed while a password change is pending
const build = (allowPasswordChange) => async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const payload = token ? verifyAdminAccess(token) : null;
  if (!payload) throw AppError.unauthorized();

  const session = await AdminSession.findOne({
    where: { uuid: payload.sid, revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
  });
  if (!session) throw AppError.unauthorized();

  const admin = await AdminUser.findOne({ where: { uuid: payload.sub } });
  if (!admin || String(admin.id) !== String(session.adminUserId)) throw AppError.unauthorized();
  if (Number(admin.status) !== ADMIN_STATUS.ACTIVE) throw AppError.forbidden('Your account is not active.', { code: 'ACCOUNT_INACTIVE' });

  if (Number(admin.mustChangePassword) === YES && !allowPasswordChange) {
    throw AppError.forbidden('Please change your password to continue.', { code: 'PASSWORD_CHANGE_REQUIRED' });
  }

  // remember activity, at most once a minute
  if (!session.lastUsedAt || Date.now() - new Date(session.lastUsedAt).getTime() > 60000) {
    session.update({ lastUsedAt: new Date() }).catch(() => {});
  }

  req.admin = {
    id: admin.id,
    uuid: admin.uuid,
    name: admin.name,
    email: admin.email,
    type: Number(admin.type),
    isMaster: Number(admin.type) === ADMIN_TYPE.MASTER,
    mustChangePassword: Number(admin.mustChangePassword) === YES,
    permissions: await PermissionService.keysFor(admin),
    sessionId: session.id,
    sessionUuid: session.uuid,
  };
  next();
};

const authenticateAdmin = build(false);
authenticateAdmin.allowPasswordChange = build(true);

module.exports = authenticateAdmin;
