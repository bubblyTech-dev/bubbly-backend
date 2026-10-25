// PLACEHOLDER factory: requireModule('fees') -> blocks the route if the plan has no "fees" module
module.exports = (moduleName) => (req, res, next) => {
  next();
};
