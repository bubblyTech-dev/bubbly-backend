const { Op } = require('sequelize');
const auth = require('@config/auth');
const context = require('@app/Helpers/context');
const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const { sequelize } = require('@app/Helpers/database');
const { newOpaqueToken } = require('@app/Helpers/token');
const { findOrFail } = require('@app/Helpers/ref');
const { Client, User, UserPasswordReset, UserSession } = require('@app/Models');
const { USER_ROLE, YES } = require('@app/Helpers/constants');
const { sendWelcome } = require('@app/Services/V1/Common/PrincipalProvisioner');
const SchoolPrincipalResource = require('@app/Resources/V1/Admin/SchoolPrincipalResource');

// What staff can do with a school's Principal login: look at it, send a new welcome link, reset the password.
//
// The Principal is created by the payment webhook when the first subscription becomes active (PrincipalProvisioner).
// Until then there is nothing to show or reset, and the endpoints answer 404 with a helpful message.
//
// A link is shown to the admin ONCE in the response (setPasswordUrl) because email may not be configured yet.
// It is never stored (only its hash is) and never written to the audit log.

const NO_PRINCIPAL = 'The Principal is created when the first subscription becomes active.';

const findPrincipal = (client, options = {}) =>
  context.run(client.id, () => User.findOne({ where: { role: USER_ROLE.PRINCIPAL }, transaction: options.transaction }));

const requirePrincipal = async (client, options) => {
  const principal = await findPrincipal(client, options);
  if (!principal) throw new AppError(404, NO_PRINCIPAL, { code: 'PRINCIPAL_NOT_FOUND' });
  return principal;
};

// when the newest welcome or reset link was made, and when it stops working
const latestLink = async (client, user) => {
  const row = await context.run(client.id, () =>
    UserPasswordReset.findOne({ where: { userId: user.id }, order: [['id', 'DESC']] }),
  );
  if (!row) return {};
  return { welcomeLinkSentAt: row.createdAt, welcomeLinkExpiresAt: row.usedAt ? null : row.expiresAt };
};

const summary = async (uuid) => {
  const client = await findOrFail(Client, uuid);
  const user = await findPrincipal(client);
  if (!user) return null;
  return SchoolPrincipalResource.make(user, await latestLink(client, user));
};

// Makes a fresh link, switches off the older unused ones, and emails it after the transaction commits.
const issueLink = async ({ client, user, transaction }) => {
  await context.run(client.id, () =>
    UserPasswordReset.update(
      { expiresAt: new Date() },
      { where: { userId: user.id, usedAt: null, expiresAt: { [Op.gt]: new Date() } }, transaction },
    ),
  );

  const { token, hash } = newOpaqueToken();
  const expiresAt = new Date(Date.now() + auth.welcomeTtlDays * 86400000);
  const row = await context.run(client.id, () =>
    UserPasswordReset.create({ userId: user.id, tokenHash: hash, expiresAt }, { transaction }),
  );

  // the mail never throws into the request; context keeps the school for the send
  transaction.afterCommit(() => context.run(client.id, () => sendWelcome(client, user, token)).catch(() => {}));

  return { setPasswordUrl: `${auth.webAppUrl}/reset-password?token=${token}`, welcomeLinkSentAt: row.createdAt, welcomeLinkExpiresAt: expiresAt };
};

const resendWelcome = async (uuid, ctx) =>
  sequelize.transaction(async (transaction) => {
    const client = await findOrFail(Client, uuid, { transaction });
    const user = await requirePrincipal(client, { transaction });
    const link = await issueLink({ client, user, transaction });

    await Audit.log(
      ctx,
      'school.principal_welcome_resent',
      {
        entityType: 'user',
        entityUuid: user.uuid,
        clientId: client.id,
        description: `Sent a new welcome link to the Principal of ${client.name}`,
      },
      { transaction },
    );

    return SchoolPrincipalResource.make(user, link);
  });

// The old password stops working, every device is signed out, and the Principal sets a new password from the link.
const resetPassword = async (uuid, ctx) =>
  sequelize.transaction(async (transaction) => {
    const client = await findOrFail(Client, uuid, { transaction });
    const user = await requirePrincipal(client, { transaction });

    await context.run(client.id, async () => {
      await user.update(
        { passwordHash: null, mustChangePassword: YES, failedLoginCount: 0, lockedUntil: null },
        { transaction },
      );
      await UserSession.update(
        { revokedAt: new Date() },
        { where: { userId: user.id, revokedAt: null }, transaction },
      );
    });

    const link = await issueLink({ client, user, transaction });

    await Audit.log(
      ctx,
      'school.principal_password_reset',
      {
        entityType: 'user',
        entityUuid: user.uuid,
        clientId: client.id,
        description: `Reset the Principal password of ${client.name}`,
      },
      { transaction },
    );

    return SchoolPrincipalResource.make(user, link);
  });

module.exports = { summary, resendWelcome, resetPassword };
