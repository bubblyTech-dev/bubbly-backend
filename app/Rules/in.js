module.exports = { test: (value, param) => String(param).split(',').includes(String(value)), message: 'The selected :field is not valid.' };
