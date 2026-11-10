const Settings = require('@app/Helpers/settings');

// Reads a platform setting that may not exist yet (a key another change adds later) without throwing.
//
//   await safeSetting('notifications.show_failed_payments', true)   -> the saved value, or true when the key is unknown
//
// Settings.get() throws for a key it does not know; this returns the fallback instead, and also when the value is empty.
const safeSetting = async (key, fallback) => {
  try {
    const value = await Settings.get(key);
    return value === undefined || value === null || value === '' ? fallback : value;
  } catch (error) {
    return fallback;
  }
};

module.exports = safeSetting;
