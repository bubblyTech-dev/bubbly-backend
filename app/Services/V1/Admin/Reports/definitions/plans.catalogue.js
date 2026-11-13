const { like, paged, gstRatePercent, periodPriceExGstSql, toNumbers } = require('../lib/sql');
const optionSets = require('../optionSets');

const limitSql = (key) => `(SELECT l.limit_value FROM plan_limits l WHERE l.plan_id = p.id AND l.limit_key = '${key}' LIMIT 1)`;

const limitText = (value) => (value === null || value === undefined ? 'Unlimited' : String(value));

// Every plan with its price, limits and features, as the school would see it.
module.exports = {
  key: 'plans.catalogue',
  area: 'plans',
  title: 'Plan catalogue',
  description: 'Every plan with its price, billing period, limits and features.',
  usesDateRange: false,

  filters: [
    { key: 'status', label: 'Plan status', type: 'select', options: 'planStatus' },
    { key: 'interval', label: 'Billing period', type: 'select', options: 'billingInterval' },
    { key: 'search', label: 'Search', type: 'text' },
  ],

  columns: [
    { key: 'name', label: 'Plan', type: 'text', width: 24 },
    { key: 'status', label: 'Status', type: 'text', width: 12 },
    { key: 'interval', label: 'Billing period', type: 'text', width: 14 },
    { key: 'pricePaise', label: 'Price', type: 'money', width: 14 },
    { key: 'taxInclusive', label: 'Price includes GST', type: 'text', width: 16 },
    { key: 'priceExGstPaise', label: 'Price without GST', type: 'money', width: 16 },
    { key: 'maxStudents', label: 'Students', type: 'text', width: 12 },
    { key: 'maxTeachers', label: 'Teachers', type: 'text', width: 12 },
    { key: 'maxClasses', label: 'Classes', type: 'text', width: 12 },
    { key: 'storageMb', label: 'Storage (MB)', type: 'text', width: 14 },
    { key: 'features', label: 'Features', type: 'text', width: 60 },
    { key: 'version', label: 'Version', type: 'integer', width: 10 },
    { key: 'razorpaySynced', label: 'On Razorpay', type: 'text', width: 12 },
    { key: 'publishedAt', label: 'Published', type: 'datetime', width: 18 },
    { key: 'activeSubscribers', label: 'Active subscribers', type: 'integer', width: 16 },
  ],

  async run({ filters, page, perPage }) {
    const where = ['p.deleted_at IS NULL'];
    const replacements = { gstRate: await gstRatePercent() };

    if (filters.status !== undefined) {
      where.push('p.status = :status');
      replacements.status = filters.status;
    }
    if (filters.interval !== undefined) {
      where.push('p.billing_interval = :interval');
      replacements.interval = filters.interval;
    }
    if (filters.search) {
      where.push('(p.name ILIKE :q OR p.description ILIKE :q)');
      replacements.q = like(filters.search);
    }

    const sql = `SELECT p.name, p.status, p.billing_interval AS interval, p.price_paise AS "pricePaise", p.tax_inclusive AS "taxInclusive",
                        ${periodPriceExGstSql('p')}::bigint AS "priceExGstPaise",
                        ${limitSql('max_students')} AS "maxStudents", ${limitSql('max_teachers')} AS "maxTeachers",
                        ${limitSql('max_classes')} AS "maxClasses", ${limitSql('storage_mb')} AS "storageMb",
                        (SELECT string_agg(f.title, '; ' ORDER BY f.sort_order, f.id) FROM plan_features f WHERE f.plan_id = p.id) AS features,
                        p.version, (p.razorpay_plan_id IS NOT NULL) AS "razorpaySynced", p.published_at AS "publishedAt",
                        (SELECT COUNT(*)::int FROM subscriptions s WHERE s.plan_id = p.id AND s.status = 2 AND s.deleted_at IS NULL) AS "activeSubscribers"
                   FROM plans p
                  WHERE ${where.join(' AND ')}
                  ORDER BY p.sort_order ASC, p.name ASC, p.id ASC`;

    const result = await paged({ sql, replacements, page, perPage });

    const rows = toNumbers(result.rows, ['pricePaise', 'priceExGstPaise']).map((row) => ({
      ...row,
      status: optionSets.label('planStatus', row.status),
      interval: optionSets.label('billingInterval', row.interval),
      taxInclusive: Number(row.taxInclusive) === 1 ? 'Yes' : 'No',
      maxStudents: limitText(row.maxStudents),
      maxTeachers: limitText(row.maxTeachers),
      maxClasses: limitText(row.maxClasses),
      storageMb: limitText(row.storageMb),
      features: row.features || '',
      razorpaySynced: row.razorpaySynced ? 'Yes' : 'No',
    }));

    return { rows, total: result.total };
  },
};
