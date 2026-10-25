const AppError = require('./AppError');

// Every table has an internal numeric `id` and a public `uuid`. The apps and URLs only ever use the uuid.
// These helpers turn a reference from a request into the row, so controllers and services never deal with the difference.
//
//   findByRef(Model, ref)                      uuid only (use this for anything that comes from a request)
//   findByRef(Model, ref, { allowId: true })   uuid or numeric id (internal code only, never for request input)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

const findByRef = async (Model, ref, { allowId = false, ...options } = {}) => {
  if (isUuid(ref)) {
    return Model.findOne({ ...options, where: { ...(options.where || {}), uuid: ref } });
  }
  if (allowId && /^\d+$/.test(String(ref))) {
    return Model.findOne({ ...options, where: { ...(options.where || {}), id: String(ref) } });
  }
  return null;
};

const findOrFail = async (Model, ref, options = {}) => {
  const row = await findByRef(Model, ref, options);
  if (!row) throw AppError.notFound();
  return row;
};

// uuid -> internal id (or null)
const resolveId = async (Model, ref, options = {}) => {
  const row = await findByRef(Model, ref, { ...options, attributes: ['id'] });
  return row ? row.id : null;
};

module.exports = { isUuid, findByRef, findOrFail, resolveId };
