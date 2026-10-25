const config = require('@config/files');

// STORAGE_DRIVER picks where files live. Add an 's3' driver here later (store, remove, exists, url).
const drivers = {
  local: () => require('./LocalDriver'),
};

if (!drivers[config.driver]) {
  throw new Error(`STORAGE_DRIVER "${config.driver}" is not available. Use: ${Object.keys(drivers).join(', ')}.`);
}

module.exports = drivers[config.driver]();
