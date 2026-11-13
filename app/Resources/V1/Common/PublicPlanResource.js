const Resource = require('@app/Resources/Resource');
const plansConfig = require('@config/plans');

// What the public pricing page may see of a published plan. No ids, no internal fields.
// `features` is the plan's text list in order (['Unlimited attendance records', ...]). The older `modules` field is gone:
// modules control access inside the app, features are what the pricing page shows.
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
      features: [...(plan.features || [])]
        .sort((a, b) => a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id))
        .map((row) => row.title),
      // the same lines with the module each one unlocks (null = text only)
      featureItems: [...(plan.features || [])]
        .sort((a, b) => a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id))
        .map((row) => ({ title: row.title, moduleKey: row.module ? row.module.moduleKey : null })),
    };
  }
}

module.exports = PublicPlanResource;
