const Resource = require('@app/Resources/Resource');
const plansConfig = require('@config/plans');

// What the public pricing page may see of a published plan. No ids, no internal fields.
class PublicPlanResource extends Resource {
  toArray() {
    const plan = this.resource;
    const stored = new Map((plan.limits || []).map((row) => [row.limitKey, row.limitValue === null ? null : Number(row.limitValue)]));

    return {
      uuid: plan.uuid,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      pricePaise: Number(plan.pricePaise),
      currency: plan.currency,
      billingInterval: Number(plan.billingInterval),
      taxInclusive: Number(plan.taxInclusive) === 1,
      isFeatured: Number(plan.isFeatured) === 1,
      limits: plansConfig.limits.map(({ key, label }) => ({ key, label, value: stored.has(key) ? stored.get(key) : null })),
      modules: (plan.planModules || [])
        .filter((row) => Number(row.included) === 1 && row.module && Number(row.module.status) === 1)
        .map((row) => row.module)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((module) => ({ moduleKey: module.moduleKey, name: module.name })),
    };
  }
}

module.exports = PublicPlanResource;
