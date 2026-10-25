// pragmatic check: something@something.tld, no spaces
module.exports = { test: (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 190, message: 'The :field must be a valid email address.' };
