module.exports = {
  test: (value, param) => (typeof value === 'number' ? value >= Number(param) : String(value).length >= Number(param)),
  message: 'The :field must be at least :param characters.',
};
