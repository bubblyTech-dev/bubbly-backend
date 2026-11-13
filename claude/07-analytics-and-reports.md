# 07. Analytics and Reports (framework)

The Admin app has an **Analytics** menu (charts and numbers) and a **Reports** menu (tables you can filter and download).
Both are built on one framework. To add a page you **add files only**: the backend and the Admin app find them by themselves.
Do not edit the shared files listed at the end.

## How it fits together

```
Admin app                                              Backend
-----------------------------------------------        -------------------------------------------------
Analytics page (/analytics/:area)                      GET /api/v1/admin/analytics/:key
  src/features/analytics/areas/<area>.ts   -----------> app/Services/V1/Admin/Analytics/definitions/<key>.js
  (which widgets, from which dataset)                    (SQL -> kpis, series, breakdowns, tables)

Reports page (/reports/:area)                          GET /api/v1/admin/reports/:key
  src/features/reports/areas/<area>.ts     -----------> app/Services/V1/Admin/Reports/definitions/<key>.js
  (which reports, in which order)                        (SQL -> rows, total, totals)

Global filter bar (top of every page)                  ?preset= &from= &to= &compare= &plan= &status= &source=
Export menu (top right of the bar)                     ?format=csv|xlsx  (ExportService)
```

- Permissions: `reports.view` for every analytics and report page and its data, `reports.export` for any download. No new permission keys.
- Every download is written to the audit log as `report.exported` (report key, format, row count, filters).
- Reference implementations to copy: `Analytics/definitions/schools.growth.js`, `Reports/definitions/schools.directory.js`,
  `src/features/analytics/areas/schools.ts`, `src/features/reports/areas/schools.ts`.

## Conventions (follow them in every definition)

- **Money is in paise** everywhere in the API (integers). The Admin app and the exports turn it into rupees. Revenue is shown **without GST**; GST is its own number.
- **Time is India time** (`Asia/Kolkata`). `range.fromDate` and `range.toDate` are JS Dates for the first and last millisecond of the range. Never use the server timezone.
- **Dates in rows**: send a `Date`/ISO timestamp, or a plain `YYYY-MM-DD` string for a date column. Do not format dates yourself.
- **Words, not codes**: turn integer codes into labels with `optionSets.label('subscriptionStatus', row.status)` (`Reports/optionSets.js`).
- **SQL is parameterised**: values go in `replacements`, never into the SQL text. User text used with `ILIKE` must be escaped (see `escapeLike` in the directory report).
- **No N+1 queries**: one SQL per number or table, use `GROUP BY`, `LATERAL` joins and `FILTER`.
- **Filters** arrive as comma separated lists in the query string (`plan=uuid1,uuid2`). Plans are public uuids; the framework turns them into ids for you.
- **Financial year**: setting `reports.fiscal_year_start_month` (default 4 = April to March). Presets `this_fiscal_year`, `last_fiscal_year` and `this_quarter` follow it. Use `fiscalYearOf(date, startMonth)` from `app/Helpers/dateRange.js` if you need it in a query.
- Settings keys of this framework: `reports.fiscal_year_start_month`, `reports.default_range`, `reports.max_export_rows` (group "Reports & analytics" in Settings).
- Row cap: an export with more than `reports.max_export_rows` rows (default 50000) is refused with a 422 and a clear message. The on-screen preview is paged and not capped.
- Exports: CSV is UTF-8 with a BOM and CRLF; Excel has a title block, a frozen header, typed cells, a totals row. Text cells starting with `= + - @` get a leading `'` (formula-injection guard). This is done for you by `ExportService`.

## (a) Add an analytics dataset

Create `backend/app/Services/V1/Admin/Analytics/definitions/<anything>.js`. It is loaded automatically at startup (a wrong shape stops the server with a clear message).

```js
const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const { bucketLabels, bucketSql, fillBuckets, kpi } = require('../series');

module.exports = {
  key: 'payments.collection',          // lowercase "area.name" (unique)
  area: 'payments-health',             // one of the areas below
  title: 'Collections',
  description: 'Money collected per period.',
  filters: ['plan', 'source'],         // which global filters this dataset honours: plan, status, source
  statusKind: 'payment',               // what the status filter lists (school, subscription, payment, invoice, inquiry, announcement, admin, webhook)
  sourceKind: 'payment',               // what the source filter lists (subscription, payment, inquiry)
  exportTable: 'recent',               // optional: the table the Export menu downloads

  async run({ range, filters, ctx }) {
    const buckets = bucketLabels(range);
    const rows = await sequelize.query(
      `SELECT ${bucketSql(range.granularity, 'p.paid_at')} AS bucket, COALESCE(SUM(p.amount_paise), 0)::bigint AS value
         FROM payments p
        WHERE p.status = 3 AND p.paid_at >= :from AND p.paid_at <= :to
        GROUP BY 1`,
      { replacements: { from: range.fromDate, to: range.toDate }, type: QueryTypes.SELECT },
    );
    const data = fillBuckets(rows, buckets);

    return {
      kpis: [kpi({ key: 'collected', label: 'Collected', value: data.reduce((a, b) => a + b, 0), unit: 'money', sparkline: data })],
      series: { perPeriod: { labels: buckets.map((b) => b.label), datasets: [{ key: 'amount', label: 'Collected', unit: 'money', data }] } },
      breakdowns: { byMethod: [{ label: 'UPI', value: 12 }] },
      tables: { recent: { columns: [{ key: 'school', label: 'School', type: 'text' }], rows: [] } },
    };
  },
};
```

**Areas** (analytics): `schools`, `subscriptions`, `revenue`, `payments-health`, `renewals-churn`, `inquiries`, `plans-modules`, `staff-security`, `system-health`, `announcements`.

**What `run()` returns** (every part is optional):

| Part | Shape | Used by widget |
|---|---|---|
| `kpis` | `[{ key, label, value, previous, change, unit, sparkline? }]`, build with `kpi({...})`; `unit` is `count`, `money` (paise), `percent`, `days` | `kpi` |
| `series.<name>` | `{ labels: [...], datasets: [{ key, label, data: [...], unit? }] }` | `line`, `area`, `bars`, `stacked` |
| `series.<name>` (heatmap) | `{ labels: [x labels], yLabels: [row labels], datasets: [{ key, label, data: [[xIndex, yIndex, value], ...] }] }` | `heatmap` |
| `breakdowns.<name>` | `[{ label, value }]` | `donut` |
| `tables.<name>` | `{ columns: [{ key, label, type }], rows: [...], totals? }`, column types `text number integer money percent date datetime` | `table` |

For a KPI with a comparison, pass `previous` (the value for `range.previous`, only when `range.previous` exists). `change` is calculated for you.

**Helpers** (`Analytics/series.js`): `bucketLabels(range)`, `bucketSql(granularity, 'table.column')`, `fillBuckets(rows, buckets, valueKey?)` (zero fills empty days), `percentChange(current, previous)`, `toRupees(paise)`, `kpi({...})`, `toList(value)`, `toIntegerList(value, field)`.
**Date helpers** (`app/Helpers/dateRange.js`): `resolveRange`, `fiscalYearOf`, `fiscalYearLabel`, `addDays`, `addMonths`, `todayIn`.

The framework gives `run()`: `range` (`from`, `to` as `YYYY-MM-DD`, `fromDate`, `toDate`, `days`, `granularity`, `previous`), `filters` (`filters.plan = { uuids, ids, names }`, `filters.status = [numbers]`, `filters.source = [numbers]`, only what the dataset declared), and `ctx` (the admin).

## (b) Add an analytics page (Admin app)

Create `admin/src/features/analytics/areas/<anything>.ts` with a default export. It is found automatically and appears in the sidebar under Analytics (an area without widgets stays hidden).

```ts
import { AnalyticsAreaConfig } from 'types/analytics';

const revenue: AnalyticsAreaConfig = {
  area: 'revenue',                       // the address: /analytics/revenue
  title: 'Revenue',
  icon: 'material-symbols:trending-up-rounded', // an icon that already exists in lib/iconify/icon-datasets.ts
  description: 'What came in, without GST.',
  order: 30,                             // sidebar order
  primaryDataset: 'revenue.trend',       // what the Export menu in the filter bar downloads (default: the first widget's dataset)
  sections: [
    { widgets: [{ type: 'kpi', dataset: 'revenue.trend', path: 'kpis.revenue', title: 'Revenue', icon: '...', goodWhen: 'up' }] },
    { title: 'Trend', widgets: [{ type: 'area', dataset: 'revenue.trend', path: 'series.perPeriod', title: 'Revenue', span: 4 }] },
  ],
};
export default revenue;
```

Widget fields: `type` (`kpi line area bars stacked donut table heatmap`), `dataset` (analytics key), `path` (`kpis.<key>`, `series.<name>`, `breakdowns.<name>`, `tables.<name>`), `title`, `subtitle?`, `span?` (1 to 4 of 4 columns; defaults kpi 1, table 4, charts 2), `format?` (`count money percent days`), `colors?`, `goodWhen?` (`down` paints a fall green), `icon?`, `maxRows?` (tables, default 10).

## (c) Add a report

Create `backend/app/Services/V1/Admin/Reports/definitions/<anything>.js`. Loaded automatically.

```js
module.exports = {
  key: 'billing.payments',               // lowercase "area.name"
  area: 'billing',                       // schools plans subscriptions billing gst-invoices renewals inquiries announcements user-access audit system
  title: 'Payments register',
  description: 'Every payment in the period.',
  usesDateRange: true,                   // false = the global date range is ignored (the page says so)
  filters: [
    { key: 'status', label: 'Status', type: 'select', options: 'paymentStatus' },   // select, multiselect, text, date
    { key: 'search', label: 'Search', type: 'text' },
  ],
  columns: [
    { key: 'paidAt', label: 'Paid', type: 'datetime', width: 18 },
    { key: 'amountPaise', label: 'Amount', type: 'money' },
  ],
  async run({ range, filters, page, perPage }) {
    // range is null when usesDateRange is false. Return one page of rows and the total number of matching rows.
    return { rows: [], total: 0, totals: { amountPaise: 0 } };   // totals is optional (shown as the last row)
  },
};
```

- `filters[].options`: a list `[{ value, label }]` or the name of a set from `Reports/optionSets.js` (`plans`, `schoolStatus`, `subscriptionStatus`, `billingSource`, `billingInterval`, `paymentStatus`, `invoiceStatus`, `inquiryStatus`, `inquirySource`, `planStatus`, `announcementType`, `announcementStatus`, `adminStatus`, `adminType`, `webhookStatus`). Add a set there if your area needs a new one.
- `run()` gets `filters` already checked against the options (a select gives the value, a multiselect an array).
- An export calls `run()` with `page: 1` and `perPage: max_export_rows + 1`, so write `LIMIT :limit OFFSET :offset` from `page` and `perPage` and nothing else is needed.
- Return rows with the column keys. Integer codes become words; money stays in paise.

## (d) Add a report page (Admin app)

Create `admin/src/features/reports/areas/<anything>.ts`:

```ts
import { ReportAreaConfig } from 'types/reports';

const billing: ReportAreaConfig = {
  area: 'billing',                       // the address: /reports/billing
  title: 'Billing',
  icon: 'material-symbols:description-outline-rounded',
  description: 'Payments, refunds and settlements.',
  order: 40,
  reports: ['billing.payments', 'billing.refunds'],   // report keys, shown as pill tabs in this order
};
export default billing;
```

## Admin building blocks (already built, reuse them)

`src/components/analytics/`: `FiltersProvider` / `useFilters()` (global filters, kept in the address and the browser), `GlobalFilterBar` (date pills, compare, plan / status / source, reset, Export at the right), `ExportMenu` (CSV and Excel; hidden without `reports.export`; also a small icon version per chart), `KpiCard`, `Sparkline`, `ChartCard` (loading, empty and error states), `AnalyticsChart` (line, area, bars, stacked, donut, heatmap; colours come from the theme), `DataTable` (typed columns, totals, pager), `WidgetRenderer`, `ReportView`.
Formatters in `src/lib/format.ts`: `formatCount`, `formatPercent`, `formatDays`, `formatRupeesFromPaise`, `formatCompactRupees` (₹1.2L, ₹3.4Cr), `formatByUnit`, `formatDateIST`, `formatDateTimeIST`.
Colours: never hard-code them. Charts read the theme through `hooks/useChartPalette`.

## Do NOT edit (shared files; they are finished)

Backend: `config/settings.js` (reports keys), `app/Helpers/dateRange.js`, `app/Services/V1/Admin/Reports/{ExportService,ReportService,RangeService,optionSets (add sets only),registry}.js`, `app/Services/V1/Admin/Analytics/{AnalyticsService,registry,series}.js`, the analytics and reports routes, controllers and requests, `routes/V1/Admin/index.js`.
Admin: `src/components/analytics/*`, `src/pages/analytics/*`, `src/pages/reports/*`, `src/features/*/registry.ts`, `routes/{router.tsx,paths.ts,sitemap.ts}`, `src/lib/format.ts`, `src/types/{analytics,reports}.ts`, the services.
If you really need a change there, say so in your report instead of editing.

## Testing a definition

Use a throwaway database (never `bubbly`): create it, run `npm run migration` and `npm run seeder` with `DB_NAME=<scratch>`, start the API on a spare port with `ADMIN_LOGIN_RATE_MAX=1000`, insert a few rows with known dates, and check the numbers against the response. The framework itself is covered by 153 checks (date ranges and fiscal years, CSV and Excel, permissions, the reference dataset and report, the export cap); keep your own test script next to it in the scratchpad and delete your throwaway data afterwards.
