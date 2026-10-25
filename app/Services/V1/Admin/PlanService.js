const { Op } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const { findOrFail } = require('@app/Helpers/ref');
const { AppModule, Plan, PlanLimit, PlanModule } = require('@app/Models');
const { PLAN_STATUS, MODULE_STATUS, YES, NO } = require('@app/Helpers/constants');
const plansConfig = require('@config/plans');
const PlanResource = require('@app/Resources/V1/Admin/PlanResource');
const PlanUsage = require('./PlanUsage');

// ctx is { admin, ip, userAgent } of the person making the change (used for created_by and the audit log).

const LIMIT_KEYS = plansConfig.limits.map((limit) => limit.key);
const LOCKED_MESSAGE = 'This plan is published, so this cannot change. Duplicate the plan to create a new version.';

const fullInclude = [
  { model: PlanLimit, as: 'limits' },
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

const options = () => ({
  limits: plansConfig.limits,
  intervals: plansConfig.intervals,
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
    const modules = await resolveModules(data.modules, transaction);

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
// limits and modules may grow, and may shrink only while no school uses the plan. Archived: read only.
const update = async (ctx, uuid, data) =>
  sequelize.transaction(async (transaction) => {
    const plan = await load(uuid, transaction);
    const before = snapshot(plan);

    if (Number(plan.status) === PLAN_STATUS.ARCHIVED) {
      throw AppError.validation({ plan: ['An archived plan cannot be edited. Duplicate it to start a new draft.'] });
    }

    const limits = parseLimits(data.limits);
    const modules = data.modules === undefined || data.modules === null ? null : await resolveModules(data.modules, transaction);
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
            throw AppError.validation({ modules: ['Schools are using this plan, so a module cannot be removed. Duplicate the plan instead.'] });
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

    const saved = await load(uuid, transaction);
    await Audit.log(
      ctx,
      'plan.updated',
      { entityType: 'plan', entityUuid: saved.uuid, description: `Updated plan "${saved.name}"`, before, after: snapshot(saved) },
      { transaction },
    );
    return output(saved);
  });

const publish = async (ctx, uuid) =>
  sequelize.transaction(async (transaction) => {
    const plan = await load(uuid, transaction);
    const before = snapshot(plan);

    if (Number(plan.status) !== PLAN_STATUS.DRAFT) throw AppError.validation({ plan: ['Only a draft plan can be published.'] });

    const problems = [];
    if (!includedModules(plan).some((row) => Number(row.module.status) === MODULE_STATUS.ACTIVE)) problems.push('Add at least one module before publishing.');
    if (!Number.isFinite(Number(plan.pricePaise)) || Number(plan.pricePaise) < 0) problems.push('Set a price (0 or more) before publishing.');
    if (problems.length) throw AppError.validation({ plan: problems });

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

// a new draft with the same limits and modules, one version higher (the way to change the price of a published plan)
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

module.exports = { options, list, show, create, update, publish, archive, duplicate, remove };
