// an ISO date and time such as 2026-11-01T09:30 or 2026-11-01T09:30:00.000Z
module.exports = {
  test: (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value)),
  message: 'The :field must be a valid date and time.',
};
