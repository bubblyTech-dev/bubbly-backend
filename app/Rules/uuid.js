const { isUuid } = require('../Helpers/ref');
module.exports = { test: (value) => isUuid(value), message: 'The :field is not valid.' };
