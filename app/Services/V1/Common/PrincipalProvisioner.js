const auth = require('@config/auth');
const context = require('@app/Helpers/context');
const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const Settings = require('@app/Helpers/settings');
const Mailer = require('@app/Providers/Mailer');
const { newOpaqueToken } = require('@app/Helpers/token');
const { User, UserPasswordReset } = require('@app/Models');
const { USER_ROLE, USER_STATUS, YES } = require('@app/Helpers/constants');
const UserDirectory = require('./UserDirectory');

// Creates a school's Principal login the first time the school becomes active (called by the payment webhook later).
//
//   const { user, created } = await provisionPrincipal(client, { transaction })
//
// - The Principal comes from the school's contact (name, email, phone). They have NO password yet; they set it from a
//   welcome link (valid auth.welcomeTtlDays days) that is emailed through Mailer, using POST /user/auth/reset-password.
// - Safe to call again: if the school already has a Principal nothing is created and nothing is sent.
// - With a transaction the email is sent only after it commits, so the link never points at a rolled-back row.
// - The token is never logged or audited. (Without Loops configured the Mailer prints it, but only outside production.)

const sendWelcome = async (client, user, token) => {
  await Mailer.sendTransactional({
    to: user.email,
    transactionalId: (await Settings.get('email.loops_tx_welcome')) || process.env.LOOPS_TX_WELCOME,
    data: {
      name: user.name || '',
      schoolName: client.name || '',
      setPasswordUrl: `${auth.webAppUrl}/reset-password?token=${token}`,
      expiresInDays: auth.welcomeTtlDays,
    },
  });
};

const provisionPrincipal = (client, { transaction } = {}) =>
  context.run(client.id, async () => {
    const existing = await User.findOne({ where: { role: USER_ROLE.PRINCIPAL }, transaction });
    if (existing) return { user: existing, created: false };

    const email = UserDirectory.normalizeEmail(client.contactEmail);
    if (!email) {
      throw new AppError(422, 'The school has no contact email, so its Principal login cannot be created.', { code: 'PRINCIPAL_CONTACT_MISSING' });
    }
    if (await UserDirectory.emailExists(email, { transaction })) {
      throw new AppError(409, 'This email is already used by another school user.', { code: 'EMAIL_IN_USE' });
    }

    const user = await User.create(
      {
        email,
        name: client.contactName,
        phone: client.contactPhone,
        role: USER_ROLE.PRINCIPAL,
        status: USER_STATUS.ACTIVE,
        mustChangePassword: YES,
        passwordHash: null,
      },
      { transaction },
    );

    const { token, hash } = newOpaqueToken();
    await UserPasswordReset.create(
      { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + auth.welcomeTtlDays * 86400000) },
      { transaction },
    );

    await Audit.log(
      {},
      'school.principal_provisioned',
      {
        entityType: 'user',
        entityUuid: user.uuid,
        clientId: client.id,
        description: `Created the Principal login for ${client.name}`,
        after: Audit.pick(user, ['email', 'name', 'role']),
      },
      { transaction },
    );

    // the mail is sent in the school's context too, then never throws into the caller
    const send = () => sendWelcome(client, user, token).catch(() => {});
    if (transaction && typeof transaction.afterCommit === 'function') transaction.afterCommit(send);
    else await send();

    return { user, created: true };
  });

module.exports = { provisionPrincipal };
