const AppError = require('@app/Helpers/AppError');
const { rangeForResponse } = require('@app/Helpers/dateRange');
const Settings = require('@app/Helpers/settings');
const registry = require('./registry');
const optionSets = require('./optionSets');
const RangeService = require('./RangeService');
const ExportService = require('./ExportService');

// The one place that lists and runs reports (rules in ./registry.js).

const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const catalogue = () =>
  registry.AREAS.map((area) => ({
    area: area.key,
    title: area.title,
    reports: registry
      .list()
      .filter((definition) => definition.area === area.key)
      .map((definition) => ({
        key: definition.key,
        title: definition.title,
        description: definition.description || '',
        usesDateRange: definition.usesDateRange,
      })),
  }));

// the filter metadata for the browser, with named option sets filled in
const describeFilters = async (definition) => {
  const filters = [];
  for (const filter of definition.filters) {
    let options;
    if (typeof filter.options === 'string') options = await optionSets.options(filter.options);
    else if (Array.isArray(filter.options)) options = filter.options;
    filters.push({ key: filter.key, label: filter.label, type: filter.type, ...(options ? { options } : {}) });
  }
  return filters;
};

// the report's own filters from the query string: checked against its options and cleaned
const readFilters = (definition, described, query) => {
  const values = {};
  const labels = [];

  for (const filter of described) {
    const raw = query[filter.key];
    if (raw === undefined || raw === null || raw === '') continue;

    if (filter.type === 'text') {
      const text = String(raw).trim().slice(0, 100);
      if (text) {
        values[filter.key] = text;
        labels.push(`${filter.label}: ${text}`);
      }
    } else if (filter.type === 'date') {
      if (!DATE_PATTERN.test(String(raw))) throw AppError.validation({ [filter.key]: [`${filter.label} is not a valid date.`] });
      values[filter.key] = String(raw);
      labels.push(`${filter.label}: ${raw}`);
    } else {
      const items = String(raw).split(',').map((item) => item.trim()).filter(Boolean);
      const allowed = (filter.options || []).map((option) => String(option.value));
      if (items.some((item) => !allowed.includes(item))) throw AppError.validation({ [filter.key]: [`${filter.label} has a value that is not valid.`] });
      const parsed = items.map((item) => (filter.options.find((option) => String(option.value) === item) || {}).value);
      values[filter.key] = filter.type === 'select' ? parsed[0] : parsed;
      labels.push(`${filter.label}: ${items.map((item) => (filter.options.find((option) => String(option.value) === item) || {}).label).join(', ')}`);
    }
  }

  return { values, labels };
};

const prepare = async (key, query) => {
  const definition = registry.get(key);
  if (!definition) throw AppError.notFound('This report does not exist.');

  const described = await describeFilters(definition);
  const { values, labels } = readFilters(definition, described, query.filtersRaw || {});
  const range = definition.usesDateRange ? await RangeService.fromQuery(query) : null;
  const text = [...(range ? [RangeService.describe(range)] : []), ...labels].join(' | ') || 'No filters';

  return { definition, described, values, range, text };
};

const columnsFor = (definition) => definition.columns.map(({ key, label, type, width }) => ({ key, label, type, ...(width ? { width } : {}) }));

const show = async (key, query, ctx) => {
  const { definition, described, values, range, text } = await prepare(key, query);
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, Number(query.perPage) || DEFAULT_PER_PAGE));

  const result = await definition.run({ range, filters: values, page, perPage, forExport: false, ctx });

  return {
    report: {
      key: definition.key,
      title: definition.title,
      description: definition.description || '',
      area: definition.area,
      usesDateRange: definition.usesDateRange,
      filters: described,
      columns: columnsFor(definition),
    },
    range: range ? rangeForResponse(range) : null,
    filtersText: text,
    rows: result.rows,
    meta: { page, perPage, total: result.total, lastPage: Math.max(1, Math.ceil(result.total / perPage)) },
    totals: result.totals || null,
  };
};

const exportFile = async (res, key, query, ctx) => {
  const { definition, values, range, text } = await prepare(key, query);
  const cap = Number(await Settings.get('reports.max_export_rows'));

  // one row more than the cap, so a too-large export is noticed without loading everything
  const result = await definition.run({ range, filters: values, page: 1, perPage: cap + 1, forExport: true, ctx });

  return ExportService.send(res, {
    format: query.format,
    filename: range ? `${definition.title} ${range.from} to ${range.to}` : definition.title,
    title: definition.title,
    filtersText: text,
    reportKey: definition.key,
    columns: columnsFor(definition),
    rows: result.rows,
    totals: result.totals,
    filters: { ...(range ? { preset: range.preset, from: range.from, to: range.to } : {}), ...values },
    ctx,
    maxRows: cap,
  });
};

module.exports = { catalogue, show, exportFile };
