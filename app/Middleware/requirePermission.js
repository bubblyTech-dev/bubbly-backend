const AppError = require('@app/Helpers/AppError');

// requirePermission('plans.edit')   the person must hold this permission.
// requirePermission('a', 'b')       the person must hold all of them.
// Works for both logins: an admin (req.admin, the master admin always passes) and a school user (req.user, from
// config/schoolPermissions.js). Use after authenticateAdmin or authenticate (the groups already do).
const requirePermission = (...keys) => (req, res, next) => {
  if (req.admin) {
    if (req.admin.isMaster || keys.every((key) => req.admin.permissions.includes(key))) return next();
    throw AppError.forbidden();
  }
  if (req.user) {
    if (keys.every((key) => req.user.permissions.includes(key))) return next();
    throw AppError.forbidden();
  }
  throw AppError.unauthorized();
};

module.exports = requirePermission;
