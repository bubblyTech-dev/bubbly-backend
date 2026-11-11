const fs = require('fs');
const path = require('path');
const optionSets = require('./optionSets');

// Every file in ./definitions is one report. The registry loads them all when the server starts,
// so adding a report means adding a file; no list has to be edited.
//
// A definition:
//   module.exports = {
//     key: 'schools.directory',                 // area.name, lowercase
//     area: 'schools',                          // one of AREAS below
//     title: 'School directory',
//     description: 'Every school with its contact and plan.',
//     usesDateRange: false,                     // default true; false = the global date range is ignored
//     filters: [                                // the report's own filters (shown above the table)
//       { key: 'status', label: 'Status', type: 'select', options: 'schoolStatus' },   // options: a set name or [{ value, label }]
//       { key: 'search', label: 'Search', type: 'text' },
//     ],                                        // types: select, multiselect, text, date
//     columns: [{ key: 'name', label: 'School', type: 'text', width: 28 }],             // types: text number integer money percent date datetime
//     async run({ range, filters, page, perPage, ctx }) { return { rows, total, totals }; },
//   };

const AREAS = [
  { key: 'schools', title: 'Schools' },
  { key: 'plans', title: 'Plans' },
  { key: 'subscriptions', title: 'Subscriptions' },
  { key: 'billing', title: 'Billing' },
  { key: 'gst-invoices', title: 'GST & Invoices' },
  { key: 'renewals', title: 'Renewals' },
  { key: 'inquiries', title: 'Inquiries' },
  { key: 'announcements', title: 'Announcements' },
  { key: 'user-access', title: 'User & Access' },
  { key: 'audit', title: 'Audit' },
  { key: 'system', title: 'System' },
];

const KEY_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;
const FILTER_TYPES = ['select', 'multiselect', 'text', 'date'];
const COLUMN_TYPES = ['text', 'number', 'integer', 'money', 'percent', 'date', 'datetime'];

const definitions = new Map();

const validate = (definition, file) => {
  const where = `Report definition ${file}`;
  if (!definition || typeof definition !== 'object') throw new Error(`${where} must export an object.`);
  if (!KEY_PATTERN.test(definition.key || '')) throw new Error(`${where} needs a key like "schools.directory".`);
  if (!AREAS.some((area) => area.key === definition.area)) throw new Error(`${where} has an unknown area "${definition.area}".`);
  if (!definition.title) throw new Error(`${where} needs a title.`);
  if (!Array.isArray(definition.columns) || definition.columns.length === 0) throw new Error(`${where} needs columns.`);
  if (typeof definition.run !== 'function') throw new Error(`${where} needs a run() function.`);
  for (const column of definition.columns) {
    if (!column.key || !column.label || !COLUMN_TYPES.includes(column.type)) throw new Error(`${where} has an invalid column "${column.key}".`);
  }
  for (const filter of definition.filters || []) {
    if (!filter.key || !filter.label || !FILTER_TYPES.includes(filter.type)) throw new Error(`${where} has an invalid filter "${filter.key}".`);
    if (typeof filter.options === 'string' && !optionSets.has(filter.options)) throw new Error(`${where} uses an unknown option set "${filter.options}".`);
  }
  if (definitions.has(definition.key)) throw new Error(`${where} repeats the key "${definition.key}".`);
};

const folder = path.join(__dirname, 'definitions');

for (const file of fs.readdirSync(folder).sort()) {
  if (!file.endsWith('.js')) continue;
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const definition = require(path.join(folder, file));
  validate(definition, file);
  definitions.set(definition.key, { usesDateRange: true, filters: [], ...definition });
}

const get = (key) => definitions.get(key) || null;

const list = () => [...definitions.values()];

module.exports = { AREAS, get, list };
