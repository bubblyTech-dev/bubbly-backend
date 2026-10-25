// at least 8 characters with a letter and a number
module.exports = {
  test: (value) => typeof value === 'string' && value.length >= 8 && value.length <= 128 && /[A-Za-z]/.test(value) && /\d/.test(value),
  message: 'The :field must be 8 to 128 characters and include a letter and a number.',
};
