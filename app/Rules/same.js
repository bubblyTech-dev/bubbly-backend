// same:otherField  (for example password confirmation)
module.exports = { test: (value, param, ctx) => value === ctx.data[param], message: 'The :field does not match.' };
