const optionSets = require('../../Reports/optionSets');
const { bucketLabels, bucketSql, fillBuckets, kpi } = require('../series');
const { select, gstRate, exGstSql } = require('../helpers/areaBShared');

// PLANS & MODULES: which plans schools choose, what the plans cost and which modules they include.
//
// Filters honoured: plan (narrows every number to the selected plans). The date range only applies to
// "new subscriptions" (subscriptions created in the range); everything else describes the plans as they are today.
//
// Metric rules:
//  - Subscribers of a plan = subscriptions that are Active or Past due (the school is still a customer).
//  - Prices are shown WITHOUT GST, per billing period (a tax-inclusive plan has its GST taken out at billing.gst_rate_percent).
//  - Module adoption: "plans" = published plans that include the module; "schools" = schools with an Active or Past due
//    subscription on one of those plans (each school counted once per module). Core modules are in every plan.
//  - Plans that were deleted are never counted; archived plans still show, because schools may still be on them.

const SUBSCRIBER_STATUSES = '(2, 3)';
const MAX_PLAN_SERIES = 6;

const planLabel = (plan) => (Number(plan.version) > 1 ? `${plan.name} v${plan.version}` : plan.name);

module.exports = {
  key: 'plans.overview',
  area: 'plans-modules',
  title: 'Plans and modules',
  description: 'Which plans schools choose, what the plans cost and which modules they include.',
  filters: ['plan'],
  exportTable: 'versions',

  async run({ range, filters }) {
    const rate = await gstRate();
    const planFilter = filters.plan ? ' AND p.id IN (:planIds)' : '';
    const planParams = filters.plan ? { planIds: filters.plan.ids } : {};
    const buckets = bucketLabels(range);

    const plans = await select(
      `SELECT p.id, p.name, p.slug, p.version, p.status, p.billing_interval AS "billingInterval", p.published_at AS "publishedAt", p.archived_at AS "archivedAt",
              ${exGstSql('p')} AS "pricePaise",
              (SELECT COUNT(*) FROM plan_features f WHERE f.plan_id = p.id)::int AS features,
              (SELECT COUNT(*) FROM subscriptions s WHERE s.plan_id = p.id AND s.deleted_at IS NULL AND s.status IN ${SUBSCRIBER_STATUSES})::int AS subscribers,
              (SELECT COUNT(*) FROM subscriptions s WHERE s.plan_id = p.id AND s.deleted_at IS NULL AND COALESCE(s.started_at, s.created_at) >= :from AND COALESCE(s.started_at, s.created_at) <= :to)::int AS "newInRange"
         FROM plans p
        WHERE p.deleted_at IS NULL${planFilter}
        ORDER BY p.sort_order, p.name, p.version, p.id`,
      { gstRate: rate, from: range.fromDate, to: range.toDate, ...planParams },
    );

    const newBefore = range.previous
      ? await select(
          `SELECT COUNT(*)::int AS value FROM subscriptions s JOIN plans p ON p.id = s.plan_id
            WHERE s.deleted_at IS NULL AND COALESCE(s.started_at, s.created_at) >= :from AND COALESCE(s.started_at, s.created_at) <= :to${planFilter}`,
          { from: range.previous.fromDate, to: range.previous.toDate, ...planParams },
        )
      : null;

    const [newPerBucketRows, intervalRows, moduleRows] = await Promise.all([
      select(
        `SELECT ${bucketSql(range.granularity, 'x.at')} AS bucket, x.plan_id AS "planId", COUNT(*)::int AS value
           FROM (SELECT s.plan_id, COALESCE(s.started_at, s.created_at) AS at
                   FROM subscriptions s JOIN plans p ON p.id = s.plan_id
                  WHERE s.deleted_at IS NULL${planFilter}) x
          WHERE x.at >= :from AND x.at <= :to
          GROUP BY 1, x.plan_id`,
        { from: range.fromDate, to: range.toDate, ...planParams },
      ),
      select(
        `SELECT s.billing_interval AS key, COUNT(*)::int AS value
           FROM subscriptions s JOIN plans p ON p.id = s.plan_id
          WHERE s.deleted_at IS NULL AND s.status IN ${SUBSCRIBER_STATUSES}${planFilter}
          GROUP BY s.billing_interval ORDER BY s.billing_interval`,
        planParams,
      ),
      select(
        `SELECT m.name, m.sort_order AS "sortOrder",
                COUNT(DISTINCT p.id)::int AS plans,
                COUNT(DISTINCT s.client_id)::int AS schools
           FROM modules m
           JOIN plan_modules pm ON pm.module_id = m.id AND pm.included = 1
           JOIN plans p ON p.id = pm.plan_id AND p.deleted_at IS NULL AND p.status = 2${planFilter}
           LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.deleted_at IS NULL AND s.status IN ${SUBSCRIBER_STATUSES}
          GROUP BY m.id, m.name, m.sort_order
          ORDER BY schools DESC, plans DESC, m.sort_order, m.name
          LIMIT 8`,
        planParams,
      ),
    ]);

    // new subscriptions per period, one line per plan (the biggest plans, the rest together)
    const totals = new Map();
    for (const row of newPerBucketRows) totals.set(String(row.planId), (totals.get(String(row.planId)) || 0) + row.value);
    const ranked = plans.filter((plan) => totals.has(String(plan.id))).sort((a, b) => totals.get(String(b.id)) - totals.get(String(a.id)));
    const top = ranked.slice(0, MAX_PLAN_SERIES);
    const topIds = new Set(top.map((plan) => String(plan.id)));
    const datasets = top.map((plan) => ({
      key: `plan_${plan.id}`,
      label: planLabel(plan),
      data: fillBuckets(newPerBucketRows.filter((row) => String(row.planId) === String(plan.id)), buckets),
    }));
    if (ranked.length > top.length) {
      datasets.push({ key: 'others', label: 'Other plans', data: fillBuckets(newPerBucketRows.filter((row) => !topIds.has(String(row.planId))).reduce((list, row) => {
        const found = list.find((item) => item.bucket === row.bucket);
        if (found) found.value += row.value;
        else list.push({ bucket: row.bucket, value: row.value });
        return list;
      }, []), buckets) });
    }

    const countStatus = (status) => plans.filter((plan) => Number(plan.status) === status).length;
    const published = plans.filter((plan) => Number(plan.status) === 2);
    const subscribersTotal = plans.reduce((sum, plan) => sum + plan.subscribers, 0);
    const newTotal = plans.reduce((sum, plan) => sum + plan.newInRange, 0);
    const newSeries = buckets.map((bucket, index) => datasets.reduce((sum, dataset) => sum + dataset.data[index], 0));
    const byStatus = [1, 2, 3].map((status) => ({ label: optionSets.label('planStatus', status), value: countStatus(status) })).filter((item) => item.value > 0);

    const labels = plans.map(planLabel);

    return {
      kpis: [
        kpi({ key: 'publishedPlans', label: 'Published plans', value: published.length }),
        kpi({ key: 'draftPlans', label: 'Draft plans', value: countStatus(1) }),
        kpi({ key: 'subscribers', label: 'Active subscribers', value: subscribersTotal }),
        kpi({ key: 'newSubscriptions', label: 'New subscriptions', value: newTotal, previous: newBefore ? newBefore[0].value : undefined, sparkline: newSeries }),
      ],
      series: {
        popularity: { labels, datasets: [{ key: 'subscribers', label: 'Active subscribers', data: plans.map((plan) => plan.subscribers) }] },
        prices: { labels, datasets: [{ key: 'price', label: 'Price without GST', unit: 'money', data: plans.map((plan) => Number(plan.pricePaise)) }] },
        features: { labels, datasets: [{ key: 'features', label: 'Features', data: plans.map((plan) => plan.features) }] },
        newByPlan: { labels: buckets.map((bucket) => bucket.label), datasets },
        modules: {
          labels: moduleRows.map((row) => row.name),
          datasets: [
            { key: 'plans', label: 'Published plans with it', data: moduleRows.map((row) => row.plans) },
            { key: 'schools', label: 'Schools using it', data: moduleRows.map((row) => row.schools) },
          ],
        },
      },
      breakdowns: {
        byInterval: intervalRows.map((row) => ({ label: optionSets.label('billingInterval', row.key), value: row.value })),
        byStatus,
      },
      tables: {
        versions: {
          columns: [
            { key: 'name', label: 'Plan', type: 'text' },
            { key: 'version', label: 'Version', type: 'integer' },
            { key: 'status', label: 'Status', type: 'text' },
            { key: 'interval', label: 'Billing', type: 'text' },
            { key: 'pricePaise', label: 'Price (no GST)', type: 'money' },
            { key: 'subscribers', label: 'Subscribers', type: 'integer' },
            { key: 'publishedAt', label: 'Published', type: 'date' },
          ],
          rows: plans.map((plan) => ({
            name: plan.name,
            version: plan.version,
            status: optionSets.label('planStatus', plan.status),
            interval: optionSets.label('billingInterval', plan.billingInterval),
            pricePaise: Number(plan.pricePaise),
            subscribers: plan.subscribers,
            publishedAt: plan.publishedAt,
          })),
        },
      },
    };
  },
};
