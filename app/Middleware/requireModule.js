const AppError = require('@app/Helpers/AppError');
const SubscriptionAccess = require('@app/Services/V1/Common/SubscriptionAccess');

// requireModule('fees')   the school's plan must include the "fees" module (core modules are always included).
// Use after checkSubscription (the user group already ran it); if it did not, the plan is looked up here.
module.exports = (moduleKey) => async (req, res, next) => {
  if (!req.client) throw AppError.unauthorized();

  const access = req.access || (await SubscriptionAccess.forClient(req.client.id));
  req.access = access;

  if (!access.moduleKeys.has(moduleKey)) {
    throw AppError.forbidden('Your school plan does not include this feature.', { code: 'MODULE_NOT_INCLUDED' });
  }
  return next();
};
