const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const Settings = require('@app/Helpers/settings');
const { Plan } = require('@app/Models');

// Helpers shared by the report definitions of the billing-related areas (schools, plans, subscriptions,
// billing, GST and invoices, renewals). This folder is NOT scanned by the registry (only ./definitions is).
//
// Conventions of these reports:
//  - Revenue and taxable values are WITHOUT GST; GST is its own column.
//  - An invoice is the source of truth for the GST split of a payment. A payment without an invoice counts as
//    "taxable = amount, GST = 0" in the registers (the settlement check flags such payments).
//  - Money is in paise; the framework turns it into rupees for the screen and the exports.

const escapeLike = (text) => String(text).replace(/[\\%_]/g, (match) => `\\${match}`);

const like = (text) => `%${escapeLike(text)}%`;

const select = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

const gstRatePercent = async () => {
  const value = Number(await Settings.get('billing.gst_rate_percent'));
  return Number.isFinite(value) && value >= 0 ? value : 18;
};

// public plan uuid -> internal id (0 when it does not exist, so the filter matches nothing)
const planIdOf = async (uuid) => {
  if (!uuid) return null;
  const plan = await Plan.findOne({ where: { uuid }, attributes: ['id'] });
  return plan ? plan.id : 0;
};

// the price of one billing period without GST, for a subscription (s) of a plan (p). Needs the :gstRate replacement.
// Plans are immutable once published, so the plan's price is the price of the subscription.
const periodPriceExGstSql = (p = 'p') =>
  `(CASE WHEN ${p}.tax_inclusive = 1 THEN ROUND(${p}.price_paise * 100.0 / (100 + :gstRate)) ELSE ${p}.price_paise END)`;

// the monthly recurring revenue of a subscription without GST (quarterly /3, yearly /12). Needs :gstRate.
const mrrSql = (s = 's', p = 'p') =>
  `ROUND(${periodPriceExGstSql(p)} * (CASE ${s}.billing_interval WHEN 2 THEN 1.0 / 3 WHEN 3 THEN 1.0 / 12 ELSE 1 END))`;

// the invoice of a payment (one per payment; the newest non-void one if there were ever two)
const invoiceOfPaymentSql = (alias = 'inv', p = 'p') => `LEFT JOIN LATERAL (
        SELECT i.id, i.invoice_no, i.subtotal_paise, i.tax_paise, i.total_paise
          FROM invoices i
         WHERE i.payment_id = ${p}.id AND i.status <> 4
         ORDER BY i.id DESC
         LIMIT 1
      ) ${alias} ON TRUE`;

// the latest refund event of a payment (when it was refunded and why), from the audit log
const refundEventSql = (alias = 'r', p = 'p') => `LEFT JOIN LATERAL (
        SELECT a.created_at, a.after_data
          FROM audit_logs a
         WHERE a.entity_type = 'payment' AND a.action = 'payment.refunded' AND a.entity_uuid = ${p}.uuid
         ORDER BY a.id DESC
         LIMIT 1
      ) ${alias} ON TRUE`;

const NUMERIC_DEFAULT = (value) => (value === null || value === undefined ? value : Number(value));

// pg gives bigint and numeric results as strings; turn the listed keys into numbers
const toNumbers = (rows, keys) =>
  rows.map((row) => {
    const copy = { ...row };
    for (const key of keys) copy[key] = NUMERIC_DEFAULT(copy[key]);
    return copy;
  });

const oneRowToNumbers = (row, keys) => (row ? toNumbers([row], keys)[0] : {});

// Runs a listing query with paging. `sql` is a complete SELECT with its ORDER BY and without LIMIT.
// `totalsSql` (optional) is a SELECT of SUMs over the whole filtered set, using the same replacements.
const paged = async ({ sql, replacements = {}, page, perPage, totalsSql }) => {
  const params = { ...replacements, limit: perPage, offset: (page - 1) * perPage };
  const [{ total }] = await select(`SELECT COUNT(*)::int AS total FROM (${sql}) counted`, params);
  const rows = await select(`${sql} LIMIT :limit OFFSET :offset`, params);
  const totals = totalsSql ? (await select(totalsSql, params))[0] : undefined;
  return { rows, total, totals };
};

// The filters most billing reports share: plan (public uuid), source (online or offline) and a school name search.
// `sub` is the alias that holds plan_id and source (the subscription for subscription reports, the payment for payment reports
// joined to its subscription as `s`), `client` is the alias of the clients table.
const applyCommonFilters = async (filters, where, replacements, { plan = 's', source = 's', client = 'c' } = {}) => {
  if (filters.plan) {
    where.push(`${plan}.plan_id = :planId`);
    replacements.planId = await planIdOf(filters.plan);
  }
  if (filters.source !== undefined) {
    where.push(`${source}.source = :source`);
    replacements.source = filters.source;
  }
  if (filters.school) {
    where.push(`${client}.name ILIKE :school`);
    replacements.school = like(filters.school);
  }
};

// FROM and JOINs of the payment-based reports: the payment, its school, its subscription and plan, and its invoice (alias inv).
const paymentFromSql = () => `FROM payments p
      JOIN clients c ON c.id = p.client_id
      LEFT JOIN subscriptions s ON s.id = p.subscription_id
      LEFT JOIN plans pl ON pl.id = s.plan_id
      ${invoiceOfPaymentSql('inv', 'p')}`;

// a payment counts as money received when it was captured (also when it was refunded later)
const PAID_STATUSES = '(3, 5, 6)';
const PAID_AT = 'COALESCE(p.paid_at, p.created_at)';
const TAXABLE = `CASE WHEN p.status IN ${PAID_STATUSES} THEN COALESCE(inv.subtotal_paise, p.amount_paise) END`;
const GST = `CASE WHEN p.status IN ${PAID_STATUSES} THEN COALESCE(inv.tax_paise, 0) END`;

module.exports = {
  escapeLike,
  like,
  select,
  gstRatePercent,
  planIdOf,
  periodPriceExGstSql,
  mrrSql,
  invoiceOfPaymentSql,
  refundEventSql,
  toNumbers,
  oneRowToNumbers,
  paged,
  applyCommonFilters,
  paymentFromSql,
  PAID_STATUSES,
  PAID_AT,
  TAXABLE,
  GST,
};
