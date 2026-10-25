module.exports = { test: (value) => Number.isInteger(Number(value)) && String(value).trim() !== '', message: 'The :field must be a whole number.' };
