const requirePermission = require('@app/Middleware/requirePermission');

// For routes that show data AND can download it (?format=csv|xlsx): showing needs the route's own permission,
// downloading additionally needs reports.export.
const requireExportPermission = (req, res, next) => {
  if (!req.query.format) return next();
  return requirePermission('reports.export')(req, res, next);
};

module.exports = requireExportPermission;
