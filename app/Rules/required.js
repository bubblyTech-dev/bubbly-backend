// handled by the Request engine (empty values are caught before any other rule runs)
module.exports = { test: (value) => value !== undefined && value !== null && String(value).trim() !== '', message: 'The :field field is required.' };
