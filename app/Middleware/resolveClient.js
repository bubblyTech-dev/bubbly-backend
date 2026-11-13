const context = require('@app/Helpers/context');
const AppError = require('@app/Helpers/AppError');
const { Client } = require('@app/Models');
const { CLIENT_STATUS } = require('@app/Helpers/constants');

// Loads the logged-in user's school, refuses a suspended or archived one, and runs the rest of the request inside that
// school's tenant context. From here on every school-owned model only sees this school's rows.
// The school comes from the user's database row (set by authenticate), NEVER from the request body, query or address.
module.exports = async (req, res, next) => {
  if (!req.user || !req.user.clientId) throw AppError.unauthorized();

  const client = await Client.findByPk(req.user.clientId);
  if (!client) throw AppError.unauthorized();
  if (Number(client.status) !== CLIENT_STATUS.ACTIVE) {
    throw new AppError(403, 'This school account is not active. Please contact Bubbly support.', { code: 'SCHOOL_SUSPENDED' });
  }

  req.client = client;
  return context.run(client.id, () => next());
};
