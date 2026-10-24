const logger = require('@app/Helpers/logger');

// PLACEHOLDER factory: requirePermission('students.create') -> checks the user's permission
module.exports = (permission) => (req, res, next) => {
  logger.dim(`   -> middleware: requirePermission(${permission})`);
  next();
};
