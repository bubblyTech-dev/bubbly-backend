const { Op } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const { findOrFail } = require('@app/Helpers/ref');
const { AppModule, Plan, PlanFeature, PlanLimit, PlanModule } = require('@app/Models');
const { PLAN_STATUS, MODULE_STATUS, YES, NO } = require('@app/Helpers/constants');
const plansConfig = require('@config/plans');
const PlanResource = require('@app/Resources/V1/Admin/PlanResource');
const Settings = require('@app/Helpers/settings');
const Razorpay = require('@app/Services/V1/Common/PaymentGateway/RazorpayService');
const PlanUsage = require('./PlanUsage');
const GatewaySyncService = require('./GatewaySyncService');

// ctx is { admin, ip, userAgent } of the person making the change (used for created_by and the audit log).

const LIMIT_KEYS = plansConfig.limits.map((limit) => limit.key);
const MAX_FEATURES = 30;
const MAX_FEATURE_LENGTH = 200;
const LOCKED_MESSAGE = 'This plan is published, so this cannot change. Duplicate the plan to create a new version.';

const fullInclude = [
  { model: PlanLimit, as: 'limits' },
  { model: PlanFeature, as: 'features', include: [{ model: AppModule, as: 'module', attributes: ['id', 'moduleKey'] }] },
  { model: PlanModule, as: 'planModules', include: [{ model: AppModule, as: 'module' }] },
];

const toFlag = (value) => ([true, 1, '1', 'true'].includes(value) ? YES : NO);

const slugify = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

// a free slug: pricing-plan, pricing-plan-2, pricing-plan-3 ...
const uniqueSlug = async (base, { excludeId, transaction } = {}) => {
  const root = slugify(base) || 'plan';
  let candidate = root;

  for (let n = 2; ; n += 1) {
    const where = { slug: candidate };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    if (!(await Plan.findOne({ where, attributes: ['id'], transaction }))) return candidate;
    candidate = `${root}-${n}`;
  }
};

const load = (uuid, transaction) => findOrFail(Plan, uuid, { include: fullInclude, transaction });

const limitsOf = (plan) => {
  const stored = new Map((plan.limits || []).map((row) => [row.limitKey, row.limitValue === null ? null : Number(row.limitValue)]));
  return Object.fromEntries(LIMIT_KEYS.map((key) => [key, stored.has(key) ? stored.get(key) : null]));
};

// the plan's features in list order: [{ title, moduleKey }]  (moduleKey is null when the line is text only)
const featuresOf = (plan) =>
  [...(plan.features || [])]
    .sort((a, b) => a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id))
    .map((row) => ({ title: row.title, moduleKey: row.module ? row.module.moduleKey : null }));

const includedModules = (plan) => (plan.planModules || []).filter((row) => Number(row.included) === YES && row.module);

// only safe fields go into the audit log
const snapshot = (plan) => ({
  name: plan.name,
  slug: plan.slug,
  description: plan.description,
  pricePaise: Number(plan.pricePaise),
  billingInterval: Number(plan.billingInterval),
  taxInclusive: Number(plan.taxInclusive),
  status: Number(plan.status),
  isFeatured: Number(plan.isFeatured),
  sortOrder: plan.sortOrder,
  version: plan.version,
  limits: limitsOf(plan),
  features: featuresOf(plan),
  modules: includedModules(plan).map((row) => row.module.moduleKey).sort(),
});

// { max_students: 100, storage_mb: null } -> only the keys that were sent, each a whole number or null (unlimited)
const parseLimits = (input) => {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw AppError.validation({ limits: ['The limits are not valid.'] });

  const parsed = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!LIMIT_KEYS.includes(key)) throw AppError.validation({ limits: [`"${key}" is not a known limit.`] });
    if (raw === null || raw === '') {
      parsed[key] = null;
      continue;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) throw AppError.validation({ limits: ['Each limit must be a whole number or empty for unlimited.'] });
    parsed[key] = value;
  }
  return parsed;
};

// A feature is a text line, or { title, moduleKey } when it also unlocks a module.
// ['Line one', { title: 'Fees', moduleKey: 'fees' }] -> [{ title, moduleKey }] trimmed, no empty lines, no repeats
// (any letter case), at most 30. A module key must belong to an ACTIVE module (checked in resolveFeatureModules).
const parseFeatures = (input) => {
  if (input === undefined || input === null) return null;
  if (!Array.isArray(input)) throw AppError.validation({ features: ['The features are not valid.'] });
  if (input.length > MAX_FEATURES) throw AppError.validation({ features: [`A plan can have at most ${MAX_FEATURES} features.`] });

  const seen = new Set();
  const features = [];
  for (const item of input) {
    const isText = typeof item === 'string';
    const isObject = item !== null && typeof item === 'object' && !Array.isArray(item) && typeof item.title === 'string';
    if (!isText && !isObject) throw AppError.validation({ features: ['The features are not valid.'] });

    const title = (isText ? item : item.title).trim().replace(/\s+/g, ' ');
    const rawKey = isObject ? item.moduleKey : null;
    if (rawKey !== undefined && rawKey !== null && rawKey !== '' && typeof rawKey !== 'string') {
      throw AppError.validation({ features: ['The features are not valid.'] });
    }
    const moduleKey = rawKey ? String(rawKey).trim() : null;

    if (!title) throw AppError.validation({ features: ['A feature cannot be empty.'] });
    if (title.length > MAX_FEATURE_LENGTH) throw AppError.validation({ features: [`A feature must not be longer than ${MAX_FEATURE_LENGTH} characters.`] });
    if (seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    features.push({ title, moduleKey });
  }
  return features;
};

// module keys of the features -> active modules (a Map key -> module). Unknown or inactive keys are a 422 on `features`.
const resolveFeatureModules = async (features, transaction) => {
  const keys = [...new Set(features.map((feature) => feature.moduleKey).filter(Boolean))];
  if (!keys.length) return new Map();

  const modules = await AppModule.findAll({ where: { moduleKey: keys, status: MODULE_STATUS.ACTIVE }, transaction });
  const found = new Map(modules.map((module) => [module.moduleKey, module]));
  const missing = keys.filter((key) => !found.has(key));
  if (missing.length) throw AppError.validation({ features: [`Unknown or inactive module: ${missing.join(', ')}.`] });
  return found;
};

// module uuids -> modules. Core modules are always part of a plan, so they are added here.
const resolveModules = async (input, transaction) => {
  const requested = input === undefined || input === null ? [] : input;
  if (!Array.isArray(requested) || requested.some((item) => typeof item !== 'string')) {
    throw AppError.validation({ modules: ['The modules are not valid.'] });
  }

  const unique = [...new Set(requested)];
  const chosen = unique.length ? await AppModule.findAll({ where: { uuid: unique, status: MODULE_STATUS.ACTIVE }, transaction }) : [];
  if (chosen.length !== unique.length) throw AppError.validation({ modules: ['One or more modules are not valid or are inactive.'] });

  const core = await AppModule.findAll({ where: { isCore: YES, status: MODULE_STATUS.ACTIVE }, transaction });
  const byId = new Map([...chosen, ...core].map((module) => [String(module.id), module]));
  return [...byId.values()];
};

const writeLimits = async (plan, limits, transaction) => {
  const existing = new Map((plan.limits || []).map((row) => [row.limitKey, row]));

  for (const [key, value] of Object.entries(limits)) {
    if (existing.has(key)) await existing.get(key).update({ limitValue: value }, { transaction });
    else await PlanLimit.create({ planId: plan.id, limitKey: key, limitValue: value }, { transaction });
  }
};

// The plan ends up with exactly these features, in this order. A feature that is still in the list keeps its row
// (and uuid); removed ones are deleted and new ones are added.
const writeFeatures = async (plan, features, modulesByKey, transaction) => {
  const rows = await PlanFeature.findAll({ where: { planId: plan.id }, transaction });
  const free = new Map();
  for (const row of rows) {
    const key = String(row.title).toLowerCase();
    if (!free.has(key)) free.set(key, row);
    else await row.destroy({ transaction });
  }

  for (const [index, feature] of features.entries()) {
    const key = feature.title.toLowerCase();
    const moduleId = feature.moduleKey ? modulesByKey.get(feature.moduleKey).id : null;
    const row = free.get(key);
    if (row) {
      free.delete(key);
      await row.update({ title: feature.title, sortOrder: index, moduleId }, { transaction });
    } else {
      await PlanFeature.create({ planId: plan.id, title: feature.title, sortOrder: index, moduleId }, { transaction });
    }
  }
  for (const row of free.values()) await row.destroy({ transaction });
};

// The plan's modules follow its feature links: core modules always, plus every module a feature links to.
const modulesFromFeatures = async (modulesByKey, transaction) => {
  const core = await AppModule.findAll({ where: { isCore: YES, status: MODULE_STATUS.ACTIVE }, transaction });
  const byId = new Map([...core, ...modulesByKey.values()].map((module) => [String(module.id), module]));
  return [...byId.values()];
};

// the plan ends up with exactly these modules
const writeModules = async (plan, modules, transaction) => {
  const wanted = new Set(modules.map((module) => String(module.id)));
  const rows = await PlanModule.findAll({ where: { planId: plan.id }, transaction });

  for (const row of rows) {
    if (!wanted.has(String(row.moduleId))) await row.destroy({ transaction });
    else {
      if (Number(row.included) !== YES) await row.update({ included: YES }, { transaction });
      wanted.delete(String(row.moduleId));
    }
  }
  for (const moduleId of wanted) await PlanModule.create({ planId: plan.id, moduleId, included: YES }, { transaction });
};

const output = async (plan) => PlanResource.make(plan, { inUse: await PlanUsage.count(plan) });

const escapeLike = (text) => text.replace(/[\\%_]/g, '\\$&');

// maxAutoChargeRupees is the note shown in the plan form: above it automatic debit may not work (RBI limit)
const options = async () => ({
  limits: plansConfig.limits,
  intervals: plansConfig.intervals,
  maxAutoChargeRupees: Number(await Settings.get('billing.max_auto_charge_rupees')),
});

const list = async ({ search, status, page, perPage }) => {
  const size = Math.min(100, Math.max(1, Number(perPage) || 15));
  const current = Math.max(1, Number(page) || 1);

  const where = {};
  if (status) where.status = Number(status);
  if (search) {
    const like = `%${escapeLike(search)}%`;
    where[Op.or] = [{ name: { [Op.iLike]: like } }, { slug: { [Op.iLike]: like } }];
  }

  // find the page of ids first, then load those plans with their limits and modules
  const { rows: idRows, count } = await Plan.findAndCountAll({
    where,
    attributes: ['id'],
    order: [['sortOrder', 'ASC'], ['id', 'ASC']],
    limit: size,
    offset: (current - 1) * size,
  });

  const ids = idRows.map((row) => row.id);
  const plans = ids.length ? await Plan.findAll({ where: { id: ids }, include: fullInclude, order: [['sortOrder', 'ASC'], ['id', 'ASC']] }) : [];

  const inUse = new Map(await Promise.all(plans.map(async (plan) => [plan.id, await PlanUsage.count(plan)])));
  return {
    data: plans.map((plan) => PlanResource.make(plan, { inUse: inUse.get(plan.id) })),
    meta: { page: current, perPage: size, total: count, lastPage: Math.max(1, Math.ceil(count / size)) },
  };
};

const show = async (uuid) => output(await load(uuid));

const create = async (ctx, data) =>
  sequelize.transaction(async (transaction) => {
    const limits = parseLimits(data.limits);
    const features = parseFeatures(data.features);
    // with features the modules follow the feature links; the older `modules` list is used only when no features are sent
    const featureModules = features ? await resolveFeatureModules(features, transaction) : new Map();
    const modules = features ? await modulesFromFeatures(featureModules, transaction) : await resolveModules(data.modules, transaction);

    const plan = await Plan.create(
      {
        name: data.name,
        slug: await uniqueSlug(data.slug || data.name, { transaction }),
        description: data.description ?? null,
        pricePaise: Number(data.pricePaise),
        currency: 'INR',
        billingInterval: Number(data.billingInterval),
        taxInclusive: toFlag(data.taxInclusive),
        isFeatured: toFlag(data.isFeatured),
        sortOrder: data.sortOrder === undefined ? 0 : Number(data.sortOrder),
        status: PLAN_STATUS.DRAFT,
        version: 1,
        createdBy: ctx.admin.id,
        updatedBy: ctx.admin.id,
      },
      { transaction },
    );

    // every configured limit gets a row, so nothing is left unclear (empty = unlimited)
    await writeLimits(plan, Object.fromEntries(LIMIT_KEYS.map((key) => [key, limits[key] ?? null])), transaction);
    await writeModules(plan, modules, transaction);
    if (features) await writeFeatures(plan, features, featureModules, transaction);

    const saved = await load(plan.uuid, transaction);
    await Audit.log(
      ctx,
      'plan.created',
      { entityType: 'plan', entityUuid: saved.uuid, description: `Created plan "${saved.name}"`, after: snapshot(saved) },
      { transaction },
    );
    return output(saved);
  });

// Draft: everything can change. Published: price, interval, tax and slug are locked (schools already pay for them);
// feature lines can always change (their module links rebuild the plan's modules; a module in use cannot be unlinked); limits and modules may grow, and may shrink only while no school uses the plan. Archived: read only.
const update = async (ctx, uuid, data) =>
  sequelize.transaction(async (transaction) => {
    const plan = await load(uuid, transaction);
    const before = snapshot(plan);

    if (Number(plan.status) === PLAN_STATUS.ARCHIVED) {
      throw AppError.validation({ plan: ['An archived plan cannot be edited. Duplicate it to start a new draft.'] });
    }

    const limits = parseLimits(data.limits);
    const features = parseFeatures(data.features);
    const featureModules = features ? await resolveFeatureModules(features, transaction) : new Map();
    // with features the modules follow the feature links; the older `modules` list is used only when no features are sent
    const modules = features
      ? await modulesFromFeatures(featureModules, transaction)
      : data.modules === undefined || data.modules === null
        ? null
        : await resolveModules(data.modules, transaction);
    const moduleField = features ? 'features' : 'modules';
    const published = Number(plan.status) === PLAN_STATUS.PUBLISHED;

    if (published) {
      const locked = {};
      if (data.pricePaise !== undefined && Number(data.pricePaise) !== Number(plan.pricePaise)) locked.pricePaise = [LOCKED_MESSAGE];
      if (data.billingInterval !== undefined && Number(data.billingInterval) !== Number(plan.billingInterval)) locked.billingInterval = [LOCKED_MESSAGE];
      if (data.taxInclusive !== undefined && toFlag(data.taxInclusive) !== Number(plan.taxInclusive)) locked.taxInclusive = [LOCKED_MESSAGE];
      if (data.slug !== undefined && slugify(data.slug) !== plan.slug) locked.slug = [LOCKED_MESSAGE];
      if (Object.keys(locked).length) throw AppError.validation(locked);

      if ((await PlanUsage.count(plan)) > 0) {
        const current = limitsOf(plan);
        const shrinks = Object.entries(limits).some(([key, value]) => {
          if (current[key] === null) return value !== null;
          return value !== null && value < current[key];
        });
        if (shrinks) throw AppError.validation({ limits: ['Schools are using this plan, so a limit cannot be lowered. Duplicate the plan instead.'] });

        if (modules) {
          const keep = new Set(modules.map((module) => String(module.id)));
          if (includedModules(plan).some((row) => !keep.has(String(row.moduleId)))) {
            throw AppError.validation({ [moduleField]: ['Schools are using this plan, so a module cannot be removed (unlink it from the feature). Duplicate the plan instead.'] });
          }
        }
      }
    }

    const changes = { updatedBy: ctx.admin.id };
    if (data.name !== undefined) changes.name = data.name;
    if (data.description !== undefined) changes.description = data.description;
    if (data.isFeatured !== undefined) changes.isFeatured = toFlag(data.isFeatured);
    if (data.sortOrder !== undefined) changes.sortOrder = Number(data.sortOrder);
    if (!published) {
      if (data.slug !== undefined) changes.slug = await uniqueSlug(data.slug, { excludeId: plan.id, transaction });
      if (data.pricePaise !== undefined) changes.pricePaise = Number(data.pricePaise);
      if (data.billingInterval !== undefined) changes.billingInterval = Number(data.billingInterval);
      if (data.taxInclusive !== undefined) changes.taxInclusive = toFlag(data.taxInclusive);
    }

    await plan.update(changes, { transaction });
    if (Object.keys(limits).length) await writeLimits(plan, limits, transaction);
    if (modules) await writeModules(plan, modules, transaction);
    if (features) await writeFeatures(plan, features, featureModules, transaction); // a published plan may change its feature lines; the modules follow their links

    const saved = await load(uuid, transaction);
    await Audit.log(
      ctx,
      'plan.updated',
      { entityType: 'plan', entityUuid: saved.uuid, description: `Updated plan "${saved.name}"`, before, after: snapshot(saved) },
      { transaction },
    );
    return output(saved);
  });

// what a plan needs before it can be published
const checkPublishable = (plan) => {
  const problems = [];
  if (!includedModules(plan).some((row) => Number(row.module.status) === MODULE_STATUS.ACTIVE)) problems.push('Add at least one module before publishing.');
  if (!Number.isFinite(Number(plan.pricePaise)) || Number(plan.pricePaise) < 0) problems.push('Set a price (0 or more) before publishing.');
  if (problems.length) throw AppError.validation({ plan: problems });
};

// Publishing also creates the plan on Razorpay when the keys are set. Razorpay is called first, so if it fails the
// plan stays a draft and nothing is half done. Without keys the plan still publishes and stays "not synced".
const publish = async (ctx, uuid) => {
  const draft = await load(uuid);

  if (Number(draft.status) !== PLAN_STATUS.DRAFT) throw AppError.validation({ plan: ['Only a draft plan can be published.'] });
  checkPublishable(draft);

  if (Razorpay.isConfigured()) await GatewaySyncService.syncPlan(draft, ctx);

  return sequelize.transaction(async (transaction) => {
    const plan = await load(uuid, transaction);
    const before = snapshot(plan);

    if (Number(plan.status) !== PLAN_STATUS.DRAFT) throw AppError.validation({ plan: ['Only a draft plan can be published.'] });
    checkPublishable(plan);

    await plan.update({ status: PLAN_STATUS.PUBLISHED, publishedAt: new Date(), updatedBy: ctx.admin.id }, { transaction });

    const saved = await load(uuid, transaction);
    await Audit.log(
      ctx,
      'plan.published',
      { entityType: 'plan', entityUuid: saved.uuid, description: `Published plan "${saved.name}"`, before, after: snapshot(saved) },
      { transaction },
    );
    return output(saved);
  });
};

// POST /admin/plans/:uuid/sync-gateway
const syncGateway = async (ctx, uuid) => {
  await GatewaySyncService.syncPlanByUuid(uuid, ctx);
  return output(await load(uuid));
};

// an archived plan disappears from the pricing page; schools already on it keep it
const archive = async (ctx, uuid) =>
  sequelize.transaction(async (transaction) => {
    const plan = await load(uuid, transaction);
    const before = snapshot(plan);

    if (Number(plan.status) === PLAN_STATUS.ARCHIVED) throw AppError.validation({ plan: ['This plan is already archived.'] });

    await plan.update({ status: PLAN_STATUS.ARCHIVED, archivedAt: new Date(), updatedBy: ctx.admin.id }, { transaction });

    const saved = await load(uuid, transaction);
    await Audit.log(
      ctx,
      'plan.archived',
      { entityType: 'plan', entityUuid: saved.uuid, description: `Archived plan "${saved.name}"`, before, after: snapshot(saved) },
      { transaction },
    );
    return output(saved);
  });

// a new draft with the same limits, modules and features, one version higher (the way to change the price of a published plan)
const duplicate = async (ctx, uuid) =>
  sequelize.transaction(async (transaction) => {
    const source = await load(uuid, transaction);

    const copy = await Plan.create(
      {
        name: `${source.name} (copy)`.slice(0, 150),
        slug: await uniqueSlug(`${source.slug}-copy`, { transaction }),
        description: source.description,
        pricePaise: source.pricePaise,
        currency: source.currency,
        billingInterval: source.billingInterval,
        taxInclusive: source.taxInclusive,
        isFeatured: NO,
        sortOrder: source.sortOrder,
        status: PLAN_STATUS.DRAFT,
        version: Number(source.version) + 1,
        createdBy: ctx.admin.id,
        updatedBy: ctx.admin.id,
      },
      { transaction },
    );

    await writeLimits(copy, limitsOf(source), transaction);
    await writeModules(copy, includedModules(source).map((row) => row.module), transaction);
    const sourceFeatures = featuresOf(source);
    await writeFeatures(copy, sourceFeatures, await resolveFeatureModules(sourceFeatures, transaction), transaction);

    const saved = await load(copy.uuid, transaction);
    await Audit.log(
      ctx,
      'plan.duplicated',
      { entityType: 'plan', entityUuid: saved.uuid, description: `Duplicated plan "${source.name}" as "${saved.name}"`, before: snapshot(source), after: snapshot(saved) },
      { transaction },
    );
    return output(saved);
  });

const remove = async (ctx, uuid) =>
  sequelize.transaction(async (transaction) => {
    const plan = await load(uuid, transaction);
    const before = snapshot(plan);

    if (Number(plan.status) !== PLAN_STATUS.DRAFT) {
      throw AppError.validation({ plan: ['Only a draft plan can be deleted. Archive a published plan instead.'] });
    }
    if ((await PlanUsage.count(plan)) > 0) throw AppError.validation({ plan: ['Schools are using this plan, so it cannot be deleted.'] });

    await plan.destroy({ transaction });

    await Audit.log(
      ctx,
      'plan.deleted',
      { entityType: 'plan', entityUuid: plan.uuid, description: `Deleted plan "${plan.name}"`, before },
      { transaction },
    );
  });

module.exports = { options, list, show, create, update, publish, syncGateway, archive, duplicate, remove };
