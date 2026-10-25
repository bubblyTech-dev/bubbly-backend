// An error that is safe to show to the client. Anything else becomes a generic 500.
class AppError extends Error {
  constructor(status, message, { code, errors } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }

  static badRequest(message, o) { return new AppError(400, message, o); }
  static unauthorized(message = 'Please log in to continue.', o) { return new AppError(401, message, { code: 'UNAUTHENTICATED', ...o }); }
  static forbidden(message = 'You do not have permission to do this.', o) { return new AppError(403, message, { code: 'FORBIDDEN', ...o }); }
  static notFound(message = 'Not found.', o) { return new AppError(404, message, { code: 'NOT_FOUND', ...o }); }
  static validation(errors, message = 'Please check the highlighted fields.') { return new AppError(422, message, { code: 'VALIDATION_FAILED', errors }); }
  static tooMany(message = 'Too many attempts. Please try again later.', o) { return new AppError(429, message, { code: 'TOO_MANY_REQUESTS', ...o }); }
}

module.exports = AppError;
