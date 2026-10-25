// One response shape for the whole API:
//   success: { success: true, message, data, meta }
//   error:   { success: false, message, code, errors }

const success = (res, { data = null, message = 'OK', status = 200, meta } = {}) =>
  res.status(status).json({ success: true, message, data, ...(meta ? { meta } : {}) });

const created = (res, { data = null, message = 'Created' } = {}) => success(res, { data, message, status: 201 });

const error = (res, { status = 500, message = 'Something went wrong.', code, errors } = {}) =>
  res.status(status).json({ success: false, message, ...(code ? { code } : {}), ...(errors ? { errors } : {}) });

module.exports = { success, created, error };
