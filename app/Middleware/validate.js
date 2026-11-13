const AppError = require('@app/Helpers/AppError');

// validate(LoginRequest): runs authorize() and rules(), then puts the clean data on req.validated.
// A failure answers 422 with the errors per field.
const validate = (RequestClass) => async (req, res, next) => {
  const request = new RequestClass();

  if ((await request.authorize(req)) === false) throw AppError.forbidden();

  const { errors, validated } = await request.validate(req);
  if (Object.keys(errors).length) throw AppError.validation(errors);

  req.validated = validated;
  next();
};

module.exports = validate;
