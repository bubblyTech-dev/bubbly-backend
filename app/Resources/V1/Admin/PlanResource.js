const Resource = require('@app/Resources/Resource');
const ModuleResource = require('./ModuleResource');
const plansConfig = require('@config/plans');

// limits come out as one object with every configured key: { max_students: 100, storage_mb: null }  (null = unlimited)
const limitsOf = (plan) => {
  const stored = new Map((plan.limits || []).map((row) => [row.limitKey, row.limitValue === null ? null : Number(row.limitValue)]));
  return Object.fromEntries(plansConfig.limits.map(({ key }) => [key, stored.has(key) ? stored.get(key) : null]));
};

// the feature list in order: [{ uuid, title, moduleKey }]  (moduleKey is null when the line is text only)
const featuresOf = (plan) =>
  [...(plan.features || [])]
    .sort((a, b) => a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id))
    .map((row) => ({ uuid: row.uuid, title: row.title, moduleKey: row.module ? row.module.moduleKey : null }));

const modulesOf = (plan) =>
  (plan.planModules || [])
    .filter((row) => Number(row.included) === 1 && row.module)
    .map((row) => row.module)
    .sort((a, b) => a.sortOrder - b.sortOrder);

class PlanResource extends Resource {
  toArray() {
    const plan = this.resource;

    return {
      uuid: plan.uuid,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      pricePaise: Number(plan.pricePaise),
      currency: plan.currency,
      billingInterval: Number(plan.billingInterval),
      taxInclusive: Number(plan.taxInclusive) === 1,
      status: Number(plan.status),
      sortOrder: plan.sortOrder,
      isFeatured: Number(plan.isFeatured) === 1,
      version: plan.version,
      razorpayPlanId: plan.razorpayPlanId,
      gatewaySynced: Boolean(plan.razorpayPlanId),
      razorpaySyncedAt: plan.razorpaySyncedAt,
      publishedAt: plan.publishedAt,
      archivedAt: plan.archivedAt,
      createdAt: plan.createdAt,
      limits: limitsOf(plan),
      features: featuresOf(plan),
      modules: ModuleResource.collection(modulesOf(plan)),
      inUse: this.extra.inUse ?? 0,
    };
  }
}

module.exports = PlanResource;
