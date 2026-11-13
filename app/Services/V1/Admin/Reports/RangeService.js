const Settings = require('@app/Helpers/settings');
const { resolveRange } = require('@app/Helpers/dateRange');

// Turns the date part of a request (preset, from, to, compare) into a range, using the report settings
// (fiscal year start month and the default range).
//
//   const range = await RangeService.fromQuery(req.validated);

const fromQuery = async (query = {}, options = {}) => {
  const fiscalStartMonth = Number(await Settings.get('reports.fiscal_year_start_month'));
  const defaultPreset = await Settings.get('reports.default_range');

  return resolveRange(
    { preset: query.preset, from: query.from, to: query.to, compare: query.compare },
    { fiscalStartMonth, defaultPreset, now: options.now },
  );
};

const flip = (isoDate) => isoDate.split('-').reverse().join('-');

// "01-10-2026 to 30-10-2026"
const describe = (range) => `${flip(range.from)} to ${flip(range.to)}`;

module.exports = { fromQuery, describe };
