const context = require('@app/Helpers/context');
const { User } = require('@app/Models');

// Finds school users across ALL schools. Only for the few places that must (login, reset links, "is this email taken").
// Everything else uses the User model inside a school request.

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const findByEmail = (email, options = {}) =>
  context.runWithoutTenant('look up a school user by email across all schools', () =>
    User.findOne({ where: { email: normalizeEmail(email) }, transaction: options.transaction }),
  );

// the login email is unique across every school (checked here, never by a database constraint)
const emailExists = async (email, { exceptUserId, transaction } = {}) => {
  const user = await findByEmail(email, { transaction });
  return Boolean(user && (!exceptUserId || String(user.id) !== String(exceptUserId)));
};

module.exports = { normalizeEmail, findByEmail, emailExists };
