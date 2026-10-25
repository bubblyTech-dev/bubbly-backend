const AppError = require('@app/Helpers/AppError');

// requirePermission('plans.edit')   the admin must hold this permission. The master admin always passes.
// requirePermission('a', 'b')       the admin must hold all of them.
// Use after authenticateAdmin (the admin group already does).
const requirePermission = (...keys) => (req, res, next) => {
  if (!req.admin) throw AppError.unauthorized();
  if (req.admin.isMaster || keys.every((key) => req.admin.permissions.includes(key))) return next();
  throw AppError.forbidden();
};

module.exports = requirePermission;
