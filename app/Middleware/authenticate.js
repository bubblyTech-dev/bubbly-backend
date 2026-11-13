const { Op } = require('sequelize');
const context = require('@app/Helpers/context');
const AppError = require('@app/Helpers/AppError');
const { verifyUserAccess } = require('@app/Helpers/token');
const { User, UserSession } = require('@app/Models');
const { USER_STATUS, YES } = require('@app/Helpers/constants');
const { permissionsFor, roleNames } = require('@config/schoolPermissions');

// Checks a school user's access token, then that the session is still alive (so "log out" works immediately) and the
// account is still active. On success: req.user = { id, uuid, clientId, role, roleName, name, email, permissions, ... }.
// The school itself is checked and the tenant context is started by resolveClient, which runs right after this.
//
//   router.get('/x', authenticate, resolveClient, handler)                          normal use (the user group does this)
//   router.get('/me', authenticate.allowPasswordChange, resolveClient, handler)     also allowed while a password change is pending
const build = (allowPasswordChange) => async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const payload = token ? verifyUserAccess(token) : null;
  if (!payload) throw AppError.unauthorized();

  // the user and session are found BEFORE the school is known, so this one lookup crosses schools on purpose
  const [session, user] = await context.runWithoutTenant('authenticate: load the session and user of an access token', () =>
    Promise.all([
      UserSession.findOne({ where: { uuid: payload.sid, revokedAt: null, expiresAt: { [Op.gt]: new Date() } } }),
      User.findOne({ where: { uuid: payload.sub } }),
    ]),
  );
  if (!session || !user || String(user.id) !== String(session.userId)) throw AppError.unauthorized();
  if (String(user.clientId) !== String(session.clientId)) throw AppError.unauthorized();
  if (Number(user.status) !== USER_STATUS.ACTIVE) throw AppError.forbidden('Your account is not active.', { code: 'ACCOUNT_INACTIVE' });

  if (Number(user.mustChangePassword) === YES && !allowPasswordChange) {
    throw AppError.forbidden('Please change your password to continue.', { code: 'PASSWORD_CHANGE_REQUIRED' });
  }

  // remember activity, at most once a minute
  if (!session.lastUsedAt || Date.now() - new Date(session.lastUsedAt).getTime() > 60000) {
    context.run(user.clientId, () => session.update({ lastUsedAt: new Date() })).catch(() => {});
  }

  req.user = {
    id: user.id,
    uuid: user.uuid,
    clientId: user.clientId,
    role: Number(user.role),
    roleName: roleNames[Number(user.role)] || null,
    name: user.name,
    email: user.email,
    mustChangePassword: Number(user.mustChangePassword) === YES,
    permissions: permissionsFor(user.role),
    sessionId: session.id,
    sessionUuid: session.uuid,
  };
  next();
};

const authenticate = build(false);
authenticate.allowPasswordChange = build(true);

module.exports = authenticate;
