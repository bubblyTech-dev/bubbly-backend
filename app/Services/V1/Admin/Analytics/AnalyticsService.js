const AppError = require('@app/Helpers/AppError');
const Settings = require('@app/Helpers/settings');
const { isUuid } = require('@app/Helpers/ref');
const { Plan } = require('@app/Models');
const { PRESETS, resolveRange, rangeForResponse, fiscalYearLabel, todayIn } = require('@app/Helpers/dateRange');
const registry = require('./registry');
const { toList, toIntegerList } = require('./series');
const optionSets = require('../Reports/optionSets');
const ExportService = require('../Reports/ExportService');
const RangeService = require('../Reports/RangeService');

// What the global filter bar needs, and the one place that runs an analytics dataset.

// which option set a definition's status / source filter uses
const STATUS_SETS = {
  school: 'schoolStatus',
  subscription: 'subscriptionStatus',
  payment: 'paymentStatus',
  invoice: 'invoiceStatus',
  inquiry: 'inquiryStatus',
  announcement: 'announcementStatus',
  admin: 'adminStatus',
  webhook: 'webhookStatus',
};

const SOURCE_SETS = {
  subscription: 'billingSource',
  payment: 'billingSource',
  inquiry: 'inquirySource',
};

const PRESET_LABELS = {
  today: 'Today',
  yesterday: 'Yesterday',
  last_7_days: 'Last 7 days',
  last_30_days: 'Last 30 days',
  last_90_days: 'Last 90 days',
  last_12_months: 'Last 12 months',
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
  this_fiscal_year: 'This financial year',
  last_fiscal_year: 'Last financial year',
  custom: 'Custom',
};

const meta = async () => {
  const fiscalStartMonth = Number(await Settings.get('reports.fiscal_year_start_month'));
  const defaultRange = await Settings.get('reports.default_range');
  const now = new Date();

  const presets = PRESETS.map((value) => {
    if (value === 'custom') return { value, label: PRESET_LABELS.custom, from: null, to: null };
    const range = resolveRange({ preset: value }, { fiscalStartMonth, now });
    const suffix = value === 'this_fiscal_year' || value === 'last_fiscal_year' ? ` (${fiscalYearLabel(range.from, fiscalStartMonth)})` : '';
    return { value, label: `${PRESET_LABELS[value]}${suffix}`, from: range.from, to: range.to };
  });

  const statusOptions = {};
  for (const [kind, set] of Object.entries(STATUS_SETS)) statusOptions[kind] = await optionSets.options(set);
  const sourceOptions = {};
  for (const [kind, set] of Object.entries(SOURCE_SETS)) sourceOptions[kind] = await optionSets.options(set);

  return {
    plans: await optionSets.options('plans'),
    statusOptions,
    sourceOptions,
    presets,
    defaultRange: PRESETS.includes(defaultRange) ? defaultRange : 'last_30_days',
    fiscalStartMonth,
    fiscalYear: fiscalYearLabel(todayIn(now), fiscalStartMonth),
    timezone: 'Asia/Kolkata',
  };
};

// the datasets grouped by area, for the sidebar and for building pages
const catalogue = () =>
  registry.AREAS.map((area) => ({
    area: area.key,
    title: area.title,
    datasets: registry
      .list()
      .filter((definition) => definition.area === area.key)
      .map((definition) => ({
        key: definition.key,
        title: definition.title,
        description: definition.description || '',
        filters: definition.filters,
        statusKind: definition.statusKind || null,
        sourceKind: definition.sourceKind || null,
      })),
  }));

// the filters a definition honours, checked and turned into what its SQL needs
const filtersFrom = async (definition, query) => {
  const filters = {};

  if (definition.filters.includes('plan')) {
    const uuids = toList(query.plan);
    if (uuids.length) {
      if (uuids.length > 50 || uuids.some((uuid) => !isUuid(uuid))) throw AppError.validation({ plan: ['The selected plans are not valid.'] });
      const plans = await Plan.findAll({ where: { uuid: uuids }, attributes: ['id', 'uuid', 'name'] });
      if (plans.length !== uuids.length) throw AppError.validation({ plan: ['One of the selected plans does not exist.'] });
      filters.plan = { uuids, ids: plans.map((plan) => plan.id), names: plans.map((plan) => plan.name) };
    }
  }

  const checkValues = async (key, kinds, setsByKind) => {
    if (!definition.filters.includes(key)) return;
    const values = toIntegerList(query[key], key);
    if (!values.length) return;
    const setName = setsByKind[definition[`${key}Kind`] || kinds];
    const allowed = (await optionSets.options(setName)).map((option) => option.value);
    if (values.some((value) => !allowed.includes(value))) throw AppError.validation({ [key]: ['The selected values are not valid.'] });
    filters[key] = values;
    filters[`${key}Labels`] = values.map((value) => optionSets.label(setName, value));
  };

  await checkValues('status', 'school', STATUS_SETS);
  await checkValues('source', 'subscription', SOURCE_SETS);

  return filters;
};

const filtersText = (range, filters) => {
  const parts = [RangeService.describe(range)];
  if (filters.plan) parts.push(`Plan: ${filters.plan.names.join(', ')}`);
  if (filters.status) parts.push(`Status: ${filters.statusLabels.join(', ')}`);
  if (filters.source) parts.push(`Source: ${filters.sourceLabels.join(', ')}`);
  return parts.join(' | ');
};

const run = async (key, query, ctx) => {
  const definition = registry.get(key);
  if (!definition) throw AppError.notFound('This analytics view does not exist.');

  const range = await RangeService.fromQuery(query);
  const filters = await filtersFrom(definition, query);
  const data = await definition.run({ range, filters, ctx });

  return { definition, range, filters, data };
};

const show = async (key, query, ctx) => {
  const { definition, range, filters, data } = await run(key, query, ctx);
  const info = rangeForResponse(range);

  return {
    key: definition.key,
    title: definition.title,
    area: definition.area,
    description: definition.description || '',
    range: info,
    previous: info.previous,
    filtersText: filtersText(range, filters),
    data,
  };
};

// ---- export: the "current thing" of an analytics page ----

const unitType = (unit) => (unit === 'money' ? 'money' : unit === 'percent' ? 'percent' : 'number');

const exportShape = (data, exportTable) => {
  const tables = data.tables || {};
  const tableNames = Object.keys(tables);
  if (tableNames.length) {
    const table = tables[exportTable && tables[exportTable] ? exportTable : tableNames[0]];
    return { columns: table.columns, rows: table.rows, totals: table.totals };
  }

  const seriesNames = Object.keys(data.series || {});
  if (seriesNames.length) {
    const series = data.series[seriesNames[0]];
    const columns = [{ key: 'label', label: 'Period', type: 'text' }, ...series.datasets.map((dataset) => ({ key: dataset.key, label: dataset.label, type: unitType(dataset.unit) }))];
    const rows = series.labels.map((label, index) => {
      const row = { label };
      for (const dataset of series.datasets) row[dataset.key] = dataset.data[index];
      return row;
    });
    return { columns, rows };
  }

  const breakdownNames = Object.keys(data.breakdowns || {});
  if (breakdownNames.length) {
    const rows = data.breakdowns[breakdownNames[0]].map((item) => ({ label: item.label, value: item.value }));
    return { columns: [{ key: 'label', label: 'Name', type: 'text' }, { key: 'value', label: 'Value', type: 'number' }], rows };
  }

  if (Array.isArray(data.kpis) && data.kpis.length) {
    const asNumber = (item, value) => (item.unit === 'money' ? Number(value) / 100 : value);
    const rows = data.kpis.map((item) => ({
      label: item.label,
      value: asNumber(item, item.value),
      previous: item.previous === null || item.previous === undefined ? null : asNumber(item, item.previous),
      change: item.change,
    }));
    return {
      columns: [
        { key: 'label', label: 'Metric', type: 'text' },
        { key: 'value', label: 'Value', type: 'number' },
        { key: 'previous', label: 'Previous period', type: 'number' },
        { key: 'change', label: 'Change', type: 'percent' },
      ],
      rows,
    };
  }

  return null;
};

const exportFile = async (res, key, query, ctx) => {
  const { definition, range, filters, data } = await run(key, query, ctx);
  const shape = exportShape(data, data.exportTable || definition.exportTable);
  if (!shape) throw AppError.validation({ format: ['There is nothing to export for this view.'] });

  return ExportService.send(res, {
    format: query.format,
    filename: `${definition.title} ${range.from} to ${range.to}`,
    title: definition.title,
    filtersText: filtersText(range, filters),
    reportKey: definition.key,
    columns: shape.columns,
    rows: shape.rows,
    totals: shape.totals,
    filters: { preset: range.preset, from: range.from, to: range.to, plan: filters.plan?.uuids, status: filters.status, source: filters.source },
    ctx,
  });
};

module.exports = { meta, catalogue, show, exportFile, exportShape, filtersFrom };
