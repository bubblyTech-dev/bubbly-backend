const AppError = require('@app/Helpers/AppError');
const Response = require('@app/Helpers/Response');
const logger = require('@app/Helpers/logger');

const notFound = (req, res) =>
  Response.error(res, { status: 404, message: `Route not found: ${req.method} ${req.originalUrl}`, code: 'NOT_FOUND' });

// last middleware: turns every error into the standard response shape. Unknown errors never leak details.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    return Response.error(res, { status: err.status, message: err.message, code: err.code, errors: err.errors });
  }
  if (err.type === 'entity.parse.failed') return Response.error(res, { status: 400, message: 'The request body is not valid JSON.', code: 'BAD_JSON' });
  if (err.type === 'entity.too.large') return Response.error(res, { status: 413, message: 'The request is too large.', code: 'TOO_LARGE' });

  logger.error(err.stack || err.message);
  return Response.error(res, { status: 500, message: 'Something went wrong. Please try again.', code: 'SERVER_ERROR' });
};

module.exports = { notFound, errorHandler };
