const { AppModule, AdminUser, PlanModule, PlanLimit, ClientModule, ClientLimit } = require('@app/Models');
const { SUBSCRIPTION_STATUS, MODULE_STATUS, MODULE_ACCESS, YES } = require('@app/Helpers/constants');
const plansConfig = require('@config/plans');

// What a school may use = its plan + the overrides Bubbly staff set for that school. This is the ONE place where
// plan value, override and effective value are worked out (SubscriptionAccess and the Admin entitlements screen both use it).
//
// Override rule (stored in client_modules / client_limits, subscription_id = the subscription it was created under):
//   an override APPLIES when
//     - its subscription_id is empty (the school had no subscription when it was set; it lasts until staff remove it), or
//     - its subscription_id is the school's CURRENT counted subscription (see pickCurrent in SubscriptionAccess)
//       and that subscription is not Cancelled or Expired.
//   A renewal keeps the same subscription row (Razorpay renewals and offline renewals both update it), so overrides survive.
//   A new subscription (a different row) or an ended one makes the old overrides stop applying; they stay in the table
//   and are listed as "ended" (history). Staff can remove overrides at any time.
// Modules: effective = (plan modules + GRANT) - REVOKE. Core modules are always on and can never be revoked.
// Inactive modules are never available. Limits: an override replaces the plan value (empty = unlimited).

const ENDED = [SUBSCRIPTION_STATUS.CANCELLED, SUBSCRIPTION_STATUS.EXPIRED];

const isRunning = (subscription) => Boolean(subscription) && !ENDED.includes(Number(subscription.status));

const applies = (row, subscription) => {
  if (row.subscriptionId === null || row.subscriptionId === undefined) return true;
  return Boolean(subscription) && String(row.subscriptionId) === String(subscription.id) && isRunning(subscription);
};

// { modules: [...], limits: [...], moduleKeys: Set, limitValues: { key: number|null }, endedModules: [rows], endedLimits: [rows] }
// Pass { transaction } to read inside a transaction.
const compute = async ({ clientId, subscription, plan, transaction }) => {
  const modules = await AppModule.findAll({ where: { status: MODULE_STATUS.ACTIVE }, order: [['sortOrder', 'ASC'], ['id', 'ASC']], transaction });

  const included = new Set();
  if (plan) {
    const links = await PlanModule.findAll({ where: { planId: plan.id, included: YES }, transaction });
    for (const link of links) included.add(String(link.moduleId));
  }

  const moduleRows = await ClientModule.findAll({
    where: { clientId },
    include: [
      { model: AdminUser, as: 'creator', attributes: ['uuid', 'name'] },
      { model: AppModule, as: 'module', attributes: ['uuid', 'moduleKey', 'name'] },
    ],
    order: [['id', 'DESC']],
    transaction,
  });
  const limitRows = await ClientLimit.findAll({
    where: { clientId },
    include: [{ model: AdminUser, as: 'creator', attributes: ['uuid', 'name'] }],
    order: [['id', 'DESC']],
    transaction,
  });

  const moduleOverride = new Map();
  const endedModules = [];
  for (const row of moduleRows) {
    if (applies(row, subscription)) {
      if (!moduleOverride.has(String(row.moduleId))) moduleOverride.set(String(row.moduleId), row);
    } else endedModules.push(row);
  }
  const limitOverride = new Map();
  const endedLimits = [];
  for (const row of limitRows) {
    if (applies(row, subscription)) {
      if (!limitOverride.has(row.limitKey)) limitOverride.set(row.limitKey, row);
    } else endedLimits.push(row);
  }

  const moduleList = modules.map((module) => {
    const isCore = Number(module.isCore) === YES;
    const includedByPlan = isCore || included.has(String(module.id));
    const override = isCore ? null : moduleOverride.get(String(module.id)) || null;
    let effective = includedByPlan;
    if (override && Number(override.access) === MODULE_ACCESS.GRANT) effective = true;
    if (override && Number(override.access) === MODULE_ACCESS.REVOKE) effective = false;
    return { module, isCore, includedByPlan, override, effective };
  });

  const stored = new Map();
  if (plan) {
    for (const row of await PlanLimit.findAll({ where: { planId: plan.id }, transaction })) {
      stored.set(row.limitKey, row.limitValue === null ? null : Number(row.limitValue));
    }
  }
  const limitList = plansConfig.limits.map(({ key, label }) => {
    const planValue = stored.has(key) ? stored.get(key) : null;
    const override = limitOverride.get(key) || null;
    const effectiveValue = override ? (override.limitValue === null ? null : Number(override.limitValue)) : planValue;
    return { key, label, planValue, override, effectiveValue };
  });

  return {
    modules: moduleList,
    limits: limitList,
    moduleKeys: new Set(moduleList.filter((m) => m.effective).map((m) => m.module.moduleKey)),
    limitValues: Object.fromEntries(limitList.map((l) => [l.key, l.effectiveValue])),
    endedModules,
    endedLimits,
  };
};

module.exports = { compute, applies, isRunning };
