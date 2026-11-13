const { sequelize } = require('@app/Helpers/database');
const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const { findOrFail } = require('@app/Helpers/ref');
const { Client, AppModule, ClientModule, ClientLimit } = require('@app/Models');
const { MODULE_STATUS, MODULE_ACCESS, YES } = require('@app/Helpers/constants');
const plansConfig = require('@config/plans');
const SubscriptionAccess = require('@app/Services/V1/Common/SubscriptionAccess');
const Entitlements = require('@app/Services/V1/Common/Entitlements');
const SchoolService = require('./SchoolService');
const EntitlementResource = require('@app/Resources/V1/Admin/EntitlementResource');

// Per-school overrides on top of the plan (rules: Services/V1/Common/Entitlements.js).
//   - switch a module ON that the plan does not include (grant), or OFF that it includes (revoke); core modules never change
//   - set a limit to a number or to unlimited (null)
// An override lasts until staff remove it or until the subscription it was created under ends / is replaced.
// Each write needs a reason, runs in a transaction with its audit entry, and is serialised per school.
// `ctx` is { admin, ip, userAgent }.

const LIMIT_KEYS = plansConfig.limits.map((limit) => limit.key);
const MAX_LIMIT = 2000000000;
const ACCESS = { grant: MODULE_ACCESS.GRANT, revoke: MODULE_ACCESS.REVOKE };

// the key a usage counter has in SchoolService.usage
const USAGE_FIELD = { max_students: 'students', max_teachers: 'teachers', max_classes: 'classes', storage_mb: 'storageMb' };

const lock = (clientId, transaction) =>
  sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key: `entitlements:${clientId}` }, transaction });

const check = (condition, field, message) => {
  if (!condition) throw AppError.validation({ [field]: [message] });
};

const build = async (client, transaction) => {
  const current = await SubscriptionAccess.currentFor(client.id, { transaction });
  return { ...current, client };
};

// GET /schools/:uuid/entitlements
const show = async (uuid) => {
  const client = await findOrFail(Client, uuid);
  const current = await build(client);

  const counters = await SchoolService.usage(uuid);
  const usage = Object.fromEntries(Object.entries(USAGE_FIELD).map(([key, field]) => [key, counters[field]]));

  return EntitlementResource.make({ ...current, usage });
};

// An override made under a finished subscription would never apply, so it is refused.
const needRunning = (current) => {
  check(!current.subscription || Entitlements.isRunning(current.subscription), 'subscription', "This school's subscription has ended, so a change would not apply. Subscribe the school again first.");
};

const parseValue = (data) => {
  check(Object.prototype.hasOwnProperty.call(data, 'value'), 'value', 'Send a whole number, or null for unlimited.');
  if (data.value === null || data.value === undefined || data.value === '') return null;
  const value = Number(data.value);
  check(Number.isInteger(value) && value >= 0 && value <= MAX_LIMIT, 'value', `The limit must be a whole number from 0 to ${MAX_LIMIT}, or empty for unlimited.`);
  return value;
};

const limitName = (value) => (value === null ? 'unlimited' : String(value));

// Runs one change for a school inside a locked transaction and returns the fresh entitlements.
const withSchool = async (uuid, work) => {
  const client = await findOrFail(Client, uuid);
  await sequelize.transaction(async (transaction) => {
    await lock(client.id, transaction);
    await work({ client, transaction });
  });
  return show(uuid);
};

const auditFor = (ctx, client, action, description, details, transaction) =>
  Audit.log(
    ctx,
    action,
    { entityType: 'school', entityUuid: client.uuid, clientId: client.id, description, ...details },
    { transaction },
  );

// PUT /schools/:uuid/entitlements/modules/:moduleUuid
const setModule = (ctx, uuid, moduleUuid, { access, reason }) =>
  withSchool(uuid, async ({ client, transaction }) => {
    const module = await findOrFail(AppModule, moduleUuid, { transaction });
    check(ACCESS[access], 'access', 'Choose grant (switch on) or revoke (switch off).');
    check(Number(module.isCore) !== YES, 'module', `"${module.name}" is a core module. It is always on and cannot be changed.`);
    check(Number(module.status) === MODULE_STATUS.ACTIVE, 'module', `"${module.name}" is not active.`);

    const current = await build(client, transaction);
    needRunning(current);

    const entry = current.entitlements.modules.find((item) => item.module.id === module.id);
    check(entry, 'module', `"${module.name}" is not available.`);
    if (access === 'grant') check(!entry.includedByPlan, 'module', `The plan already includes "${module.name}". Nothing to change.`);
    else check(entry.includedByPlan, 'module', `The plan does not include "${module.name}". Nothing to switch off.`);

    const existing = entry.override;
    if (existing && Number(existing.access) !== ACCESS[access]) {
      throw AppError.validation({ module: [`This school has an override on "${module.name}" that goes the other way. Remove it to return to the plan.`] });
    }

    const before = existing ? { access, reason: existing.reason } : { effective: entry.effective };
    if (existing) await existing.update({ reason, createdBy: ctx.admin.id }, { transaction });
    else {
      await ClientModule.create(
        {
          clientId: client.id,
          moduleId: module.id,
          access: ACCESS[access],
          subscriptionId: current.subscription ? current.subscription.id : null,
          reason,
          createdBy: ctx.admin.id,
        },
        { transaction },
      );
    }

    const verb = access === 'grant' ? 'granted' : 'revoked';
    await auditFor(
      ctx,
      client,
      `school.entitlement.module_${verb}`,
      `${access === 'grant' ? 'Switched on' : 'Switched off'} module "${module.name}" for ${client.name}: ${reason}`,
      { before: { module: module.moduleKey, ...before }, after: { module: module.moduleKey, access, effective: access === 'grant', reason } },
      transaction,
    );
  });

// DELETE /schools/:uuid/entitlements/modules/:moduleUuid
const clearModule = (ctx, uuid, moduleUuid, { reason } = {}) =>
  withSchool(uuid, async ({ client, transaction }) => {
    const module = await findOrFail(AppModule, moduleUuid, { transaction });
    const current = await build(client, transaction);
    const entry = current.entitlements.modules.find((item) => item.module.id === module.id);
    check(entry && entry.override, 'module', `This school has no override on "${module.name}".`);

    const access = Number(entry.override.access) === MODULE_ACCESS.GRANT ? 'grant' : 'revoke';
    await entry.override.destroy({ transaction });

    await auditFor(
      ctx,
      client,
      'school.entitlement.module_cleared',
      `Removed the ${access} override on module "${module.name}" for ${client.name}${reason ? `: ${reason}` : ''}`,
      {
        before: { module: module.moduleKey, access, effective: entry.effective, reason: entry.override.reason },
        after: { module: module.moduleKey, effective: entry.includedByPlan, reason: reason || null },
      },
      transaction,
    );
  });

// PUT /schools/:uuid/entitlements/limits/:limitKey
const setLimit = (ctx, uuid, limitKey, data) =>
  withSchool(uuid, async ({ client, transaction }) => {
    check(LIMIT_KEYS.includes(limitKey), 'limitKey', `"${limitKey}" is not a known limit.`);
    const value = parseValue(data);

    const current = await build(client, transaction);
    needRunning(current);

    const entry = current.entitlements.limits.find((item) => item.key === limitKey);
    if (!entry.override) check(value !== entry.planValue, 'value', 'This is the same as the plan limit. Nothing to change.');
    else check(value !== (entry.override.limitValue === null ? null : Number(entry.override.limitValue)) || data.reason !== entry.override.reason, 'value', 'This limit is already set to that value.');

    const before = { limit: limitKey, planValue: entry.planValue, effectiveValue: entry.effectiveValue, override: entry.override ? limitName(entry.effectiveValue) : null };
    if (entry.override) await entry.override.update({ limitValue: value, reason: data.reason, createdBy: ctx.admin.id }, { transaction });
    else {
      await ClientLimit.create(
        {
          clientId: client.id,
          limitKey,
          limitValue: value,
          subscriptionId: current.subscription ? current.subscription.id : null,
          reason: data.reason,
          createdBy: ctx.admin.id,
        },
        { transaction },
      );
    }

    await auditFor(
      ctx,
      client,
      'school.entitlement.limit_set',
      `Set ${entry.label} limit of ${client.name} to ${limitName(value)} (plan: ${limitName(entry.planValue)}): ${data.reason}`,
      { before, after: { limit: limitKey, planValue: entry.planValue, effectiveValue: value, reason: data.reason } },
      transaction,
    );
  });

// DELETE /schools/:uuid/entitlements/limits/:limitKey
const clearLimit = (ctx, uuid, limitKey, { reason } = {}) =>
  withSchool(uuid, async ({ client, transaction }) => {
    check(LIMIT_KEYS.includes(limitKey), 'limitKey', `"${limitKey}" is not a known limit.`);
    const current = await build(client, transaction);
    const entry = current.entitlements.limits.find((item) => item.key === limitKey);
    check(entry.override, 'limitKey', `This school has no override on ${entry.label}.`);

    const previous = entry.effectiveValue;
    await entry.override.destroy({ transaction });

    await auditFor(
      ctx,
      client,
      'school.entitlement.limit_cleared',
      `Removed the ${entry.label} limit override of ${client.name}${reason ? `: ${reason}` : ''}`,
      {
        before: { limit: limitKey, effectiveValue: previous, reason: entry.override.reason },
        after: { limit: limitKey, effectiveValue: entry.planValue, reason: reason || null },
      },
      transaction,
    );
  });

module.exports = { show, setModule, clearModule, setLimit, clearLimit };
