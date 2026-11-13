const { groups, definitions } = require('@config/settings');
const { PlatformSetting } = require('@app/Models');

// Reads platform settings anywhere in the backend (rules live in config/settings.js).
//
//   await Settings.get('policy.grace_days')      -> 7  (the default until someone saves another value)
//   await Settings.group('billing')              -> { 'billing.gst_rate_percent': 18, ... }
//
// Saved values are cached in memory; saving a group from the Admin app calls Settings.refresh().

const byKey = new Map(definitions.map((definition) => [definition.key, definition]));

let cache = null;
let loading = null;

const load = async () => {
  const rows = await PlatformSetting.findAll();
  const next = new Map();
  for (const row of rows) next.set(row.settingKey, row);
  cache = next;
  return cache;
};

const ensureLoaded = async () => {
  if (cache) return cache;
  if (!loading) {
    loading = load().finally(() => {
      loading = null;
    });
  }
  return loading;
};

const refresh = () => load();

const definitionOf = (key) => byKey.get(key) || null;

const valueOf = (rows, definition) => {
  const row = rows.get(definition.key);
  return row && row.settingValue !== null && row.settingValue !== undefined ? row.settingValue : definition.default;
};

const get = async (key) => {
  const definition = definitionOf(key);
  if (!definition) throw new Error(`Unknown setting "${key}".`);
  return valueOf(await ensureLoaded(), definition);
};

const group = async (name) => {
  const rows = await ensureLoaded();
  const values = {};
  for (const definition of definitions) {
    if (definition.group === name) values[definition.key] = valueOf(rows, definition);
  }
  return values;
};

const definitionsOf = (name) => definitions.filter((definition) => definition.group === name);

module.exports = { get, group, refresh, definitionOf, definitionsOf, groups, definitions };
