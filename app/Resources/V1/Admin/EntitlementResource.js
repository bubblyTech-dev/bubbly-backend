const Resource = require('@app/Resources/Resource');
const { MODULE_ACCESS } = require('@app/Helpers/constants');

// A school's entitlements as the Admin app shows them. this.resource is the object built by EntitlementService:
//   { subscription, entitlements (from Entitlements.compute), usage }
// Access is 'grant' | 'revoke'. A limit value of null means unlimited.
const accessName = (access) => (Number(access) === MODULE_ACCESS.GRANT ? 'grant' : 'revoke');
const valueOf = (row) => (row.limitValue === null || row.limitValue === undefined ? null : Number(row.limitValue));
const creatorName = (row) => (row.creator ? row.creator.name : null);

class EntitlementResource extends Resource {
  toArray() {
    const { subscription, plan, entitlements, usage } = this.resource;

    return {
      subscription: subscription
        ? {
            uuid: subscription.uuid,
            status: Number(subscription.status),
            planName: plan ? plan.name : null,
            endsAt: subscription.currentPeriodEnd || subscription.endedAt || null,
          }
        : null,
      modules: entitlements.modules.map(({ module, isCore, includedByPlan, override, effective }) => ({
        uuid: module.uuid,
        key: module.moduleKey,
        name: module.name,
        description: module.description,
        isCore,
        includedByPlan,
        override: override ? { access: accessName(override.access), reason: override.reason, createdAt: override.createdAt, createdByName: creatorName(override) } : null,
        effective,
      })),
      limits: entitlements.limits.map(({ key, label, planValue, override, effectiveValue }) => ({
        key,
        label,
        planValue,
        override: override ? { value: valueOf(override), reason: override.reason, createdAt: override.createdAt, createdByName: creatorName(override) } : null,
        effectiveValue,
        ...(usage && usage[key] !== undefined ? { usage: usage[key] } : {}),
      })),
      // overrides that no longer apply (their subscription ended or a new one started), newest first
      endedOverrides: [
        ...entitlements.endedModules.map((row) => ({
          type: 'module',
          key: row.module ? row.module.moduleKey : null,
          name: row.module ? row.module.name : null,
          access: accessName(row.access),
          reason: row.reason,
          createdAt: row.createdAt,
          createdByName: creatorName(row),
        })),
        ...entitlements.endedLimits.map((row) => ({
          type: 'limit',
          key: row.limitKey,
          name: row.limitKey,
          value: valueOf(row),
          reason: row.reason,
          createdAt: row.createdAt,
          createdByName: creatorName(row),
        })),
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    };
  }
}

module.exports = EntitlementResource;
