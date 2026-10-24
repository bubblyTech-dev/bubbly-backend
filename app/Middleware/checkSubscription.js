const logger = require('@app/Helpers/logger');

// PLACEHOLDER: only logs for now, real logic comes later
module.exports = (req, res, next) => {
  logger.dim('   -> middleware: checkSubscription');
  next();
};
