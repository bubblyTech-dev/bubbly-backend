const { Op } = require('sequelize');
const auth = require('@config/auth');
const context = require('@app/Helpers/context');
const { newOpaqueToken } = require('@app/Helpers/token');
const { UserPasswordReset } = require('@app/Models');
const { sendWelcome } = require('./PrincipalProvisioner');

// Sends a school user (Teacher, or a parent's Student login) a link to set their password.
//
//   const link = await UserInviter.invite({ client, user, transaction })
//   link.setPasswordUrl   shown ONCE to the Principal (email may not be set up yet, so they can share it themselves)
//   link.expiresAt
//
// Older unused links of the user stop working. Only the hash of the token is stored. The email goes out after the
// transaction commits, so a link never points at a rolled-back row. Must run inside the school's tenant context.
const invite = async ({ client, user, transaction }) => {
  await UserPasswordReset.update(
    { expiresAt: new Date() },
    { where: { userId: user.id, usedAt: null, expiresAt: { [Op.gt]: new Date() } }, transaction },
  );

  const { token, hash } = newOpaqueToken();
  const expiresAt = new Date(Date.now() + auth.welcomeTtlDays * 86400000);
  await UserPasswordReset.create({ userId: user.id, tokenHash: hash, expiresAt }, { transaction });

  const send = () => context.run(client.id, () => sendWelcome(client, user, token)).catch(() => {});
  if (transaction) transaction.afterCommit(send);
  else await send();

  return { setPasswordUrl: `${auth.webAppUrl}/reset-password?token=${token}`, expiresAt };
};

module.exports = { invite };
