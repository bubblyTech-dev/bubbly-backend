const { Op } = require('sequelize');
const auth = require('@config/auth');
const AppError = require('@app/Helpers/AppError');
const password = require('@app/Helpers/password');
const { signAdminAccess, hashToken, newOpaqueToken } = require('@app/Helpers/token');
const Mailer = require('@app/Providers/Mailer');
const { AdminUser, AdminSession, AdminPasswordReset, AdminLoginHistory } = require('@app/Models');
const { ADMIN_STATUS, LOGIN_METHOD, LOGIN_RESULT, LOGIN_FAILURE, NO } = require('@app/Helpers/constants');
const AdminUserResource = require('@app/Resources/V1/Admin/AdminUserResource');
const PermissionService = require('./PermissionService');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const invalidCredentials = () => new AppError(401, 'Invalid email or password.', { code: 'INVALID_CREDENTIALS' });
const invalidRefresh = () => new AppError(401, 'Your session has expired. Please log in again.', { code: 'SESSION_EXPIRED' });
const addMinutes = (minutes) => new Date(Date.now() + minutes * 60000);
const addDays = (days) => new Date(Date.now() + days * 86400000);

const recordLogin = (adminUser, emailTried, result, failureReason, ctx) =>
  AdminLoginHistory.create({
    adminUserId: adminUser ? adminUser.id : null,
    emailTried: String(emailTried).slice(0, 190),
    method: LOGIN_METHOD.PASSWORD,
    result,
    failureReason: failureReason || null,
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent,
  }).catch(() => {}); // a logging problem must never block a login

// one place that builds what login and refresh return
const authPayload = async (adminUser, session) => ({
  accessToken: signAdminAccess({ adminUuid: adminUser.uuid, sessionUuid: session.uuid }),
  expiresIn: auth.accessTtlSeconds,
  user: AdminUserResource.make(adminUser, { permissions: await PermissionService.keysFor(adminUser) }),
});

const startSession = async (adminUser, ctx) => {
  const { token, hash } = newOpaqueToken();
  const session = await AdminSession.create({
    adminUserId: adminUser.id,
    refreshTokenHash: hash,
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent,
    deviceLabel: ctx.deviceLabel,
    expiresAt: addDays(auth.refreshTtlDays),
    lastUsedAt: new Date(),
  });
  return { session, refreshToken: token };
};

const revokeSessions = (adminUserId, { exceptSessionId, revokedBy } = {}) =>
  AdminSession.update(
    { revokedAt: new Date(), revokedBy: revokedBy || null },
    { where: { adminUserId, revokedAt: null, ...(exceptSessionId ? { id: { [Op.ne]: exceptSessionId } } : {}) } },
  );

const login = async ({ email, password: plain }, ctx) => {
  const emailTried = normalizeEmail(email);
  const adminUser = await AdminUser.findOne({ where: { email: emailTried } });

  if (!adminUser) {
    await password.verifyDummy(plain);
    await recordLogin(null, emailTried, LOGIN_RESULT.FAILED, LOGIN_FAILURE.UNKNOWN_EMAIL, ctx);
    throw invalidCredentials();
  }

  // while locked, do not even check the password (stops guessing during the lock)
  if (adminUser.lockedUntil && new Date(adminUser.lockedUntil) > new Date()) {
    await recordLogin(adminUser, emailTried, LOGIN_RESULT.FAILED, LOGIN_FAILURE.LOCKED, ctx);
    const minutes = Math.max(1, Math.ceil((new Date(adminUser.lockedUntil) - new Date()) / 60000));
    throw new AppError(423, `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, { code: 'ACCOUNT_LOCKED' });
  }

  const matches = await password.verify(plain, adminUser.passwordHash);
  if (!matches) {
    const failed = Number(adminUser.failedLoginCount || 0) + 1;
    const lock = failed >= auth.maxFailedLogins;
    await adminUser.update({ failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? addMinutes(auth.lockMinutes) : adminUser.lockedUntil });
    await recordLogin(adminUser, emailTried, LOGIN_RESULT.FAILED, LOGIN_FAILURE.WRONG_PASSWORD, ctx);
    throw invalidCredentials();
  }

  // the password is right; only now say that the account is switched off
  if (Number(adminUser.status) !== ADMIN_STATUS.ACTIVE) {
    await recordLogin(adminUser, emailTried, LOGIN_RESULT.FAILED, LOGIN_FAILURE.INACTIVE, ctx);
    throw AppError.forbidden('Your account is not active. Please contact the administrator.', { code: 'ACCOUNT_INACTIVE' });
  }

  await adminUser.update({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() });
  const { session, refreshToken } = await startSession(adminUser, ctx);
  await recordLogin(adminUser, emailTried, LOGIN_RESULT.SUCCESS, null, ctx);

  return { payload: await authPayload(adminUser, session), refreshToken };
};

// swaps the refresh token for a new one (rotation) and returns a fresh access token
const refresh = async (refreshToken) => {
  if (!refreshToken) throw invalidRefresh();

  const session = await AdminSession.findOne({
    where: { refreshTokenHash: hashToken(refreshToken), revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
  });
  if (!session) throw invalidRefresh();

  const adminUser = await AdminUser.findByPk(session.adminUserId);
  if (!adminUser || Number(adminUser.status) !== ADMIN_STATUS.ACTIVE) throw invalidRefresh();

  const next = newOpaqueToken();
  await session.update({ refreshTokenHash: next.hash, lastUsedAt: new Date(), expiresAt: addDays(auth.refreshTtlDays) });

  return { payload: await authPayload(adminUser, session), refreshToken: next.token };
};

const logout = async (refreshToken) => {
  if (!refreshToken) return;
  await AdminSession.update({ revokedAt: new Date() }, { where: { refreshTokenHash: hashToken(refreshToken), revokedAt: null } });
};

const me = async (admin) => {
  const adminUser = await AdminUser.findByPk(admin.id);
  return AdminUserResource.make(adminUser, { permissions: admin.permissions });
};

const changePassword = async (admin, { currentPassword, newPassword }) => {
  const adminUser = await AdminUser.findByPk(admin.id);

  if (!(await password.verify(currentPassword, adminUser.passwordHash))) {
    throw AppError.validation({ currentPassword: ['The current password is not correct.'] });
  }
  if (await password.verify(newPassword, adminUser.passwordHash)) {
    throw AppError.validation({ newPassword: ['Choose a password different from the current one.'] });
  }

  await adminUser.update({ passwordHash: await password.hash(newPassword), mustChangePassword: NO, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null });
  await revokeSessions(adminUser.id, { exceptSessionId: admin.sessionId, revokedBy: adminUser.id }); // sign out every other device
  return AdminUserResource.make(adminUser, { permissions: admin.permissions });
};

// always answers the same way, so nobody can find out which emails exist
const forgotPassword = async ({ email }, ctx) => {
  const adminUser = await AdminUser.findOne({ where: { email: normalizeEmail(email) } });
  if (!adminUser || Number(adminUser.status) !== ADMIN_STATUS.ACTIVE) return;

  await AdminPasswordReset.update({ expiresAt: new Date() }, { where: { adminUserId: adminUser.id, usedAt: null, expiresAt: { [Op.gt]: new Date() } } });
  const { token, hash } = newOpaqueToken();
  await AdminPasswordReset.create({ adminUserId: adminUser.id, tokenHash: hash, expiresAt: addMinutes(auth.resetTtlMinutes), requestedIp: ctx.ip });

  await Mailer.sendTransactional({
    to: adminUser.email,
    transactionalId: process.env.LOOPS_TX_PASSWORD_RESET,
    data: { name: adminUser.name || '', resetUrl: `${auth.adminAppUrl}/reset-password?token=${token}`, expiresInMinutes: auth.resetTtlMinutes },
  });
};

const resetPassword = async ({ token, password: plain }) => {
  const reset = await AdminPasswordReset.findOne({ where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { [Op.gt]: new Date() } } });
  if (!reset) throw new AppError(400, 'This reset link is invalid or has expired.', { code: 'INVALID_RESET_TOKEN' });

  const adminUser = await AdminUser.findByPk(reset.adminUserId);
  if (!adminUser) throw new AppError(400, 'This reset link is invalid or has expired.', { code: 'INVALID_RESET_TOKEN' });

  await adminUser.update({ passwordHash: await password.hash(plain), mustChangePassword: NO, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null });
  await reset.update({ usedAt: new Date() });
  await revokeSessions(adminUser.id, { revokedBy: adminUser.id }); // everyone is signed out after a reset
};

module.exports = { login, refresh, logout, me, changePassword, forgotPassword, resetPassword };
