// a time of day written as HH:MM (24 hour), seconds optional
module.exports = {
  test: (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value),
  message: 'The :field must be a time like 09:30.',
};
