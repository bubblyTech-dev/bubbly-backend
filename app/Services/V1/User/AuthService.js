const { Op } = require('sequelize');
const auth = require('@config/auth');
const context = require('@app/Helpers/context');
const AppError = require('@app/Helpers/AppError');
const password = require('@app/Helpers/password');
const Settings = require('@app/Helpers/settings');
const { signUserAccess, hashToken, newOpaqueToken } = require('@app/Helpers/token');
const Mailer = require('@app/Providers/Mailer');
const { User, UserSession, UserPasswordReset, UserLoginHistory, Client } = require('@app/Models');
const { USER_STATUS, CLIENT_STATUS, LOGIN_METHOD, LOGIN_RESULT, LOGIN_FAILURE, NO } = require('@app/Helpers/constants');
const { permissionsFor } = require('@config/schoolPermissions');
const UserResource = require('@app/Resources/V1/User/UserResource');
const SchoolSummaryResource = require('@app/Resources/V1/User/SchoolSummaryResource');
const SubscriptionSummaryResource = require('@app/Resources/V1/User/SubscriptionSummaryResource');
const SubscriptionAccess = require('@app/Services/V1/Common/SubscriptionAccess');
const UserDirectory = require('@app/Services/V1/Common/UserDirectory');

// Login for school users (Principal, Teacher, Student). Same security rules as the admin login:
// generic errors, a dummy hash for unknown emails, lock after repeated failures, rotating refresh token,
// sessions checked on every request. Each step that knows the school runs inside that school's tenant context.

const invalidCredentials = () => new AppError(401, 'Invalid email or password.', { code: 'INVALID_CREDENTIALS' });
const invalidRefresh = () => new AppError(401, 'Your session has expired. Please log in again.', { code: 'SESSION_EXPIRED' });
const invalidReset = () => new AppError(400, 'This reset link is invalid or has expired.', { code: 'INVALID_RESET_TOKEN' });
const schoolSuspended = () =>
  new AppError(403, 'This school account is not active. Please contact Bubbly support.', { code: 'SCHOOL_SUSPENDED' });
const addMinutes = (minutes) => new Date(Date.now() + minutes * 60000);
const addDays = (days) => new Date(Date.now() + days * 86400000);

const schoolIsActive = async (clientId) => {
  const client = await Client.findByPk(clientId);
  return client && Number(client.status) === CLIENT_STATUS.ACTIVE ? client : null;
};

// a logging problem must never block a login
const recordLogin = (user, emailTried, result, failureReason, ctx) => {
  const write = () =>
    UserLoginHistory.create({
      userId: user ? user.id : null,
      emailTried: String(emailTried).slice(0, 190),
      method: LOGIN_METHOD.PASSWORD,
      result,
      failureReason: failureReason || null,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    }).catch(() => {});

  // an unknown email has no school; a known one is recorded inside its school
  return user ? write() : context.runWithoutTenant('record a failed login for an unknown email', write);
};

const authPayload = async (user, session) => ({
  accessToken: signUserAccess({ userUuid: user.uuid, sessionUuid: session.uuid }),
  expiresIn: auth.accessTtlSeconds,
  user: UserResource.make(user, { permissions: permissionsFor(user.role) }),
});

const startSession = async (user, ctx) => {
  const { token, hash } = newOpaqueToken();
  const session = await UserSession.create({
    userId: user.id,
    refreshTokenHash: hash,
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent,
    deviceLabel: ctx.deviceLabel,
    expiresAt: addDays(auth.refreshTtlDays),
    lastUsedAt: new Date(),
  });
  return { session, refreshToken: token };
};

const revokeSessions = (userId, { exceptSessionId, revokedBy } = {}) =>
  UserSession.update(
    { revokedAt: new Date(), revokedBy: revokedBy || null },
    { where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { [Op.ne]: exceptSessionId } } : {}) } },
  );

const login = async ({ email, password: plain }, ctx) => {
  const emailTried = UserDirectory.normalizeEmail(email);
  const found = await UserDirectory.findByEmail(emailTried);

  if (!found || !found.clientId) {
    await password.verifyDummy(plain);
    await recordLogin(null, emailTried, LOGIN_RESULT.FAILED, LOGIN_FAILURE.UNKNOWN_EMAIL, ctx);
    throw invalidCredentials();
  }

  return context.run(found.clientId, async () => {
    const user = found;

    // while locked, do not even check the password (stops guessing during the lock)
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      await recordLogin(user, emailTried, LOGIN_RESULT.FAILED, LOGIN_FAILURE.LOCKED, ctx);
      const minutes = Math.max(1, Math.ceil((new Date(user.lockedUntil) - new Date()) / 60000));
      throw new AppError(423, `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, { code: 'ACCOUNT_LOCKED' });
    }

    const matches = await password.verify(plain, user.passwordHash);
    if (!matches) {
      const failed = Number(user.failedLoginCount || 0) + 1;
      const lock = failed >= auth.maxFailedLogins;
      await user.update({ failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? addMinutes(auth.lockMinutes) : user.lockedUntil });
      await recordLogin(user, emailTried, LOGIN_RESULT.FAILED, LOGIN_FAILURE.WRONG_PASSWORD, ctx);
      throw invalidCredentials();
    }

    // the password is right; only now say that the account or the school is switched off
    if (Number(user.status) !== USER_STATUS.ACTIVE) {
      await recordLogin(user, emailTried, LOGIN_RESULT.FAILED, LOGIN_FAILURE.INACTIVE, ctx);
      throw AppError.forbidden('Your account is not active. Please contact your school.', { code: 'ACCOUNT_INACTIVE' });
    }
    if (!(await schoolIsActive(user.clientId))) {
      await recordLogin(user, emailTried, LOGIN_RESULT.FAILED, LOGIN_FAILURE.INACTIVE, ctx);
      throw schoolSuspended();
    }

    await user.update({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() });
    const { session, refreshToken } = await startSession(user, ctx);
    await recordLogin(user, emailTried, LOGIN_RESULT.SUCCESS, null, ctx);

    return { payload: await authPayload(user, session), refreshToken };
  });
};

// swaps the refresh token for a new one (rotation) and returns a fresh access token
const refresh = async (refreshToken) => {
  if (!refreshToken) throw invalidRefresh();

  const found = await context.runWithoutTenant('refresh: find the session by its token hash', () =>
    UserSession.findOne({
      where: { refreshTokenHash: hashToken(refreshToken), revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
    }),
  );
  if (!found || !found.clientId) throw invalidRefresh();

  return context.run(found.clientId, async () => {
    const user = await User.findByPk(found.userId);
    if (!user || Number(user.status) !== USER_STATUS.ACTIVE) throw invalidRefresh();
    if (!(await schoolIsActive(user.clientId))) throw invalidRefresh();

    const next = newOpaqueToken();
    await found.update({ refreshTokenHash: next.hash, lastUsedAt: new Date(), expiresAt: addDays(auth.refreshTtlDays) });

    return { payload: await authPayload(user, found), refreshToken: next.token };
  });
};

const logout = async (refreshToken) => {
  if (!refreshToken) return;
  await context.runWithoutTenant('logout: end the session that owns this refresh token', () =>
    UserSession.update({ revokedAt: new Date() }, { where: { refreshTokenHash: hashToken(refreshToken), revokedAt: null } }),
  );
};

// who is logged in, their school, subscription and what they may use. Runs inside the school's tenant context.
const me = async (current, client) => {
  const user = await User.findByPk(current.id);
  const access = await SubscriptionAccess.forClient(client.id);

  return {
    user: UserResource.make(user, { permissions: current.permissions }),
    school: SchoolSummaryResource.make(client),
    subscription: SubscriptionSummaryResource.make(access),
    modules: [...access.moduleKeys].sort(),
    permissions: current.permissions,
  };
};

const changePassword = async (current, { currentPassword, newPassword }) => {
  const user = await User.findByPk(current.id);

  if (!(await password.verify(currentPassword, user.passwordHash))) {
    throw AppError.validation({ currentPassword: ['The current password is not correct.'] });
  }
  if (await password.verify(newPassword, user.passwordHash)) {
    throw AppError.validation({ newPassword: ['Choose a password different from the current one.'] });
  }

  await user.update({ passwordHash: await password.hash(newPassword), mustChangePassword: NO, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null });
  await revokeSessions(user.id, { exceptSessionId: current.sessionId, revokedBy: user.id }); // sign out every other device
  return UserResource.make(user, { permissions: current.permissions });
};

// always answers the same way, so nobody can find out which emails exist
const forgotPassword = async ({ email }, ctx) => {
  const user = await UserDirectory.findByEmail(email);
  if (!user || !user.clientId || Number(user.status) !== USER_STATUS.ACTIVE) return;

  await context.run(user.clientId, async () => {
    if (!(await schoolIsActive(user.clientId))) return;

    await UserPasswordReset.update({ expiresAt: new Date() }, { where: { userId: user.id, usedAt: null, expiresAt: { [Op.gt]: new Date() } } });
    const { token, hash } = newOpaqueToken();
    await UserPasswordReset.create({ userId: user.id, tokenHash: hash, expiresAt: addMinutes(auth.resetTtlMinutes), requestedIp: ctx.ip });

    await Mailer.sendTransactional({
      to: user.email,
      transactionalId: (await Settings.get('email.loops_tx_password_reset')) || process.env.LOOPS_TX_PASSWORD_RESET,
      data: { name: user.name || '', resetUrl: `${auth.webAppUrl}/reset-password?token=${token}`, expiresInMinutes: auth.resetTtlMinutes },
    });
  });
};

// also sets the FIRST password, from the welcome link a new Principal receives
const resetPassword = async ({ token, password: plain }) => {
  const found = await context.runWithoutTenant('reset password: find the link by its token hash', () =>
    UserPasswordReset.findOne({ where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { [Op.gt]: new Date() } } }),
  );
  if (!found || !found.clientId) throw invalidReset();

  await context.run(found.clientId, async () => {
    const user = await User.findByPk(found.userId);
    if (!user || Number(user.status) !== USER_STATUS.ACTIVE) throw invalidReset();

    await user.update({ passwordHash: await password.hash(plain), mustChangePassword: NO, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null });
    await found.update({ usedAt: new Date() });
    await revokeSessions(user.id, { revokedBy: user.id }); // everyone is signed out after a reset
  });
};

module.exports = { login, refresh, logout, me, changePassword, forgotPassword, resetPassword };
