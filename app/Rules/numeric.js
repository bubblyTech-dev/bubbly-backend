// a number, whole or decimal (for example 2 or 3.5)
module.exports = {
  test: (value) => String(value).trim() !== '' && Number.isFinite(Number(value)),
  message: 'The :field must be a number.',
};
