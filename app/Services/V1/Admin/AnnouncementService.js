const { Op } = require('sequelize');
const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const { isUuid } = require('@app/Helpers/ref');
const { sequelize } = require('@app/Helpers/database');
const { ANNOUNCEMENT_STATUS: STATUS, ANNOUNCEMENT_TARGET_TYPE: TARGET_TYPE } = require('@app/Helpers/constants');
const { Announcement, AnnouncementTarget, AdminUser } = require('@app/Models');
const AnnouncementResource = require('@app/Resources/V1/Admin/AnnouncementResource');
const PublicAnnouncementResource = require('@app/Resources/V1/Common/PublicAnnouncementResource');
const TargetResolver = require('./AnnouncementTargetResolver');

const { effectiveStatus } = AnnouncementResource;

// ctx = { admin, ip, userAgent } (the admin is req.admin), used for the audit rows.

const creatorInclude = { model: AdminUser, as: 'creator', attributes: ['uuid', 'name'] };
const LIVE_STATUSES = [STATUS.SCHEDULED, STATUS.PUBLISHED];

const toDate = (value) => (value ? new Date(value) : null);
const escapeLike = (text) => text.replace(/[\\%_]/g, (character) => `\\${character}`);

// only the fields worth keeping in the audit log
const snapshot = (announcement) => ({
  title: announcement.title,
  type: Number(announcement.type),
  status: effectiveStatus(announcement),
  targetType: Number(announcement.targetType),
  startsAt: announcement.startsAt,
  endsAt: announcement.endsAt,
});

const findOrFail = async (uuid, options = {}) => {
  if (!isUuid(uuid)) throw AppError.notFound();
  const announcement = await Announcement.findOne({ where: { uuid }, ...options });
  if (!announcement) throw AppError.notFound();
  return announcement;
};

const checkDates = (startsAt, endsAt, { requireFutureEnd = false } = {}) => {
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw AppError.validation({ endsAt: ['The end time must be after the start time.'] });
  }
  if (requireFutureEnd && endsAt && endsAt <= new Date()) {
    throw AppError.validation({ endsAt: ['The end time must be in the future.'] });
  }
};

// SQL version of effectiveStatus(), so the list filter matches what the screen shows
const statusCondition = (status, now) => {
  const live = { status: { [Op.in]: LIVE_STATUSES } };
  const notEnded = { [Op.or]: [{ endsAt: null }, { endsAt: { [Op.gt]: now } }] };
  const started = { [Op.or]: [{ startsAt: null }, { startsAt: { [Op.lte]: now } }] };

  if (status === STATUS.DRAFT) return { status: STATUS.DRAFT };
  if (status === STATUS.SCHEDULED) return { [Op.and]: [live, notEnded, { startsAt: { [Op.gt]: now } }] };
  if (status === STATUS.PUBLISHED) return { [Op.and]: [live, notEnded, started] };
  return { [Op.or]: [{ status: STATUS.EXPIRED }, { [Op.and]: [live, { endsAt: { [Op.lte]: now } }] }] };
};

const replaceTargets = async (announcement, resolved, transaction) => {
  await AnnouncementTarget.destroy({ where: { announcementId: announcement.id }, transaction });
  if (!resolved.ids.length) return;

  await AnnouncementTarget.bulkCreate(
    resolved.ids.map((targetId) => ({ announcementId: announcement.id, targetKind: resolved.kind, targetId })),
    { transaction },
  );
};

const detail = async (announcement) => {
  const targets = await AnnouncementTarget.findAll({ where: { announcementId: announcement.id } });
  return AnnouncementResource.make(announcement, { targets: await TargetResolver.describe(Number(announcement.targetType), targets) });
};

const list = async (query) => {
  const page = Number(query.page) || 1;
  const perPage = Number(query.perPage) || 15;
  const now = new Date();
  const conditions = [];

  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    conditions.push({ [Op.or]: [{ title: { [Op.iLike]: like } }, { body: { [Op.iLike]: like } }] });
  }
  if (query.type) conditions.push({ type: Number(query.type) });
  if (query.status) conditions.push(statusCondition(Number(query.status), now));

  const { rows, count } = await Announcement.findAndCountAll({
    where: conditions.length ? { [Op.and]: conditions } : {},
    include: [creatorInclude],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: perPage,
    offset: (page - 1) * perPage,
  });

  // every row also carries who it is for (names, for the list's tooltip)
  const targets = await TargetResolver.describeMany(rows);
  return {
    data: rows.map((row) => AnnouncementResource.make(row, { targets: targets.get(String(row.id)) || [] })),
    meta: { page, perPage, total: count, lastPage: Math.max(1, Math.ceil(count / perPage)) },
  };
};

const show = async (uuid) => detail(await findOrFail(uuid, { include: [creatorInclude] }));

const create = async (ctx, data) => {
  const startsAt = toDate(data.startsAt);
  const endsAt = toDate(data.endsAt);
  checkDates(startsAt, endsAt);

  const targetType = Number(data.targetType) || TARGET_TYPE.ALL;
  const resolved = await TargetResolver.resolve(targetType, data.targetUuids);

  const announcement = await sequelize.transaction(async (transaction) => {
    const created = await Announcement.create(
      {
        title: data.title,
        body: data.body,
        type: Number(data.type),
        status: STATUS.DRAFT,
        targetType,
        startsAt,
        endsAt,
        createdBy: ctx.admin.id,
        updatedBy: ctx.admin.id,
      },
      { transaction },
    );
    await replaceTargets(created, resolved, transaction);

    await Audit.log(
      ctx,
      'announcement.created',
      {
        entityType: 'announcement',
        entityUuid: created.uuid,
        description: `Created announcement "${created.title}"`,
        after: snapshot(created),
      },
      { transaction },
    );
    return created;
  });

  return show(announcement.uuid);
};

const update = async (ctx, uuid, data) => {
  const announcement = await findOrFail(uuid);
  const current = effectiveStatus(announcement);

  if (current === STATUS.EXPIRED) {
    throw AppError.validation({ status: ['This announcement has expired. Unpublish it to edit and publish it again.'] });
  }

  const onlyEndChanges = Object.keys(data).every((key) => key === 'endsAt');
  if (current === STATUS.PUBLISHED && !onlyEndChanges) {
    throw AppError.validation({ status: ['A published announcement can only change its end time. Unpublish it first to edit anything else.'] });
  }

  const before = snapshot(announcement);
  const changes = {};
  ['title', 'body'].forEach((key) => {
    if (data[key] !== undefined) changes[key] = data[key];
  });
  if (data.type !== undefined) changes.type = Number(data.type);
  if (data.startsAt !== undefined) changes.startsAt = toDate(data.startsAt);
  if (data.endsAt !== undefined) changes.endsAt = toDate(data.endsAt);

  const startsAt = 'startsAt' in changes ? changes.startsAt : announcement.startsAt && new Date(announcement.startsAt);
  const endsAt = 'endsAt' in changes ? changes.endsAt : announcement.endsAt && new Date(announcement.endsAt);
  checkDates(startsAt, endsAt, { requireFutureEnd: current !== STATUS.DRAFT && 'endsAt' in changes });

  const newTargetType = data.targetType !== undefined ? Number(data.targetType) : Number(announcement.targetType);
  const retarget = newTargetType !== Number(announcement.targetType) || data.targetUuids !== undefined;
  const resolved = retarget ? await TargetResolver.resolve(newTargetType, data.targetUuids) : null;
  if (retarget) changes.targetType = newTargetType;

  await sequelize.transaction(async (transaction) => {
    await announcement.update({ ...changes, updatedBy: ctx.admin.id }, { transaction });
    if (resolved) await replaceTargets(announcement, resolved, transaction);

    await Audit.log(
      ctx,
      'announcement.updated',
      {
        entityType: 'announcement',
        entityUuid: announcement.uuid,
        description: `Updated announcement "${announcement.title}"`,
        before,
        after: snapshot(announcement),
      },
      { transaction },
    );
  });

  return show(uuid);
};

const publish = async (ctx, uuid) => {
  const announcement = await findOrFail(uuid);
  if (effectiveStatus(announcement) !== STATUS.DRAFT) {
    throw AppError.validation({ status: ['Only a draft can be published.'] });
  }

  const now = new Date();
  const startsAt = announcement.startsAt ? new Date(announcement.startsAt) : now;
  const endsAt = toDate(announcement.endsAt);
  checkDates(startsAt, endsAt, { requireFutureEnd: true });

  if (Number(announcement.targetType) !== TARGET_TYPE.ALL) {
    const targets = await AnnouncementTarget.count({ where: { announcementId: announcement.id } });
    if (!targets) throw AppError.validation({ targetUuids: ['Choose who should see this announcement.'] });
  }

  const before = snapshot(announcement);

  await sequelize.transaction(async (transaction) => {
    await announcement.update(
      {
        status: startsAt > now ? STATUS.SCHEDULED : STATUS.PUBLISHED,
        startsAt,
        publishedAt: now,
        updatedBy: ctx.admin.id,
      },
      { transaction },
    );

    await Audit.log(
      ctx,
      'announcement.published',
      {
        entityType: 'announcement',
        entityUuid: announcement.uuid,
        description: `Published announcement "${announcement.title}"`,
        before,
        after: snapshot(announcement),
      },
      { transaction },
    );
  });

  return show(uuid);
};

const unpublish = async (ctx, uuid) => {
  const announcement = await findOrFail(uuid);
  if (effectiveStatus(announcement) === STATUS.DRAFT) {
    throw AppError.validation({ status: ['This announcement is already a draft.'] });
  }

  const before = snapshot(announcement);

  await sequelize.transaction(async (transaction) => {
    await announcement.update({ status: STATUS.DRAFT, publishedAt: null, updatedBy: ctx.admin.id }, { transaction });

    await Audit.log(
      ctx,
      'announcement.unpublished',
      {
        entityType: 'announcement',
        entityUuid: announcement.uuid,
        description: `Unpublished announcement "${announcement.title}"`,
        before,
        after: snapshot(announcement),
      },
      { transaction },
    );
  });

  return show(uuid);
};

const remove = async (ctx, uuid) => {
  const announcement = await findOrFail(uuid);
  const before = snapshot(announcement);

  await sequelize.transaction(async (transaction) => {
    await announcement.update({ updatedBy: ctx.admin.id }, { transaction });
    await announcement.destroy({ transaction }); // soft delete

    await Audit.log(
      ctx,
      'announcement.deleted',
      {
        entityType: 'announcement',
        entityUuid: announcement.uuid,
        description: `Deleted announcement "${announcement.title}"`,
        before,
      },
      { transaction },
    );
  });
};

// What the public endpoint (no login) returns: only announcements for ALL schools, because it cannot know which
// school is asking. Announcements aimed at selected schools or plans are served to the school app by the
// authenticated /user endpoint later, which filters by the logged-in school and its plan.
const active = async () => {
  const now = new Date();

  const rows = await Announcement.findAll({
    where: {
      [Op.and]: [
        { status: { [Op.in]: LIVE_STATUSES }, targetType: TARGET_TYPE.ALL },
        { [Op.or]: [{ startsAt: null }, { startsAt: { [Op.lte]: now } }] },
        { [Op.or]: [{ endsAt: null }, { endsAt: { [Op.gt]: now } }] },
      ],
    },
    order: [['publishedAt', 'DESC'], ['id', 'DESC']],
    limit: 20,
  });

  return PublicAnnouncementResource.collection(rows);
};

const targetOptions = ({ targetType, search }) => TargetResolver.options(Number(targetType), search);

module.exports = { list, show, create, update, publish, unpublish, remove, active, targetOptions };
