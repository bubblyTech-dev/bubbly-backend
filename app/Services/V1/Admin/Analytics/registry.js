const fs = require('fs');
const path = require('path');

// Every file in ./definitions is one analytics dataset. The registry loads them all when the server starts,
// so adding a dataset means adding a file; no list has to be edited.
//
// A definition:
//   module.exports = {
//     key: 'schools.growth',                    // area.name, lowercase
//     area: 'schools',                          // one of AREAS below
//     title: 'School growth',
//     description: 'How many schools joined and how the total grew.',
//     filters: ['plan', 'status'],              // which global filters this dataset honours (plan, status, source)
//     statusKind: 'school',                     // which statuses the status filter lists (school, subscription, inquiry, payment, ...)
//     sourceKind: 'subscription',               // which sources the source filter lists (subscription or inquiry)
//     async run({ range, filters, ctx }) { return { kpis, series, breakdowns, tables, exportTable }; },
//   };

const AREAS = [
  { key: 'schools', title: 'Schools' },
  { key: 'subscriptions', title: 'Subscriptions' },
  { key: 'revenue', title: 'Revenue' },
  { key: 'payments-health', title: 'Payments health' },
  { key: 'renewals-churn', title: 'Renewals & churn' },
  { key: 'inquiries', title: 'Inquiries' },
  { key: 'plans-modules', title: 'Plans & modules' },
  { key: 'staff-security', title: 'Staff & security' },
  { key: 'system-health', title: 'System health' },
  { key: 'announcements', title: 'Announcements' },
];

const FILTER_KEYS = ['plan', 'status', 'source'];
const KEY_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

const definitions = new Map();

const validate = (definition, file) => {
  const where = `Analytics definition ${file}`;
  if (!definition || typeof definition !== 'object') throw new Error(`${where} must export an object.`);
  if (!KEY_PATTERN.test(definition.key || '')) throw new Error(`${where} needs a key like "schools.growth".`);
  if (!AREAS.some((area) => area.key === definition.area)) throw new Error(`${where} has an unknown area "${definition.area}".`);
  if (!definition.title) throw new Error(`${where} needs a title.`);
  if (typeof definition.run !== 'function') throw new Error(`${where} needs a run() function.`);
  for (const filter of definition.filters || []) {
    if (!FILTER_KEYS.includes(filter)) throw new Error(`${where} uses an unknown filter "${filter}".`);
  }
  if (definitions.has(definition.key)) throw new Error(`${where} repeats the key "${definition.key}".`);
};

const folder = path.join(__dirname, 'definitions');

for (const file of fs.readdirSync(folder).sort()) {
  if (!file.endsWith('.js')) continue;
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const definition = require(path.join(folder, file));
  validate(definition, file);
  definitions.set(definition.key, { filters: [], ...definition });
}

const get = (key) => definitions.get(key) || null;

const list = () => [...definitions.values()];

module.exports = { AREAS, FILTER_KEYS, get, list };
