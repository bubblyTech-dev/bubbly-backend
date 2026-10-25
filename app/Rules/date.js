// a calendar date written as YYYY-MM-DD
module.exports = {
  test: (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  },
  message: 'The :field must be a date like 2026-10-25.',
};
