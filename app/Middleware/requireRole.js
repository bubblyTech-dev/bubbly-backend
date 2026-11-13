const AppError = require('@app/Helpers/AppError');

// requireRole(USER_ROLE.PRINCIPAL)                    only that role
// requireRole(USER_ROLE.PRINCIPAL, USER_ROLE.TEACHER) any of these roles
// Use after authenticate (the user group already does).
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) throw AppError.unauthorized();
  if (!roles.includes(req.user.role)) throw AppError.forbidden();
  return next();
};

module.exports = requireRole;
