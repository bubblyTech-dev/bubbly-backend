const { Op } = require('sequelize');
const AppError = require('@app/Helpers/AppError');
const { isUuid } = require('@app/Helpers/ref');
const { ANNOUNCEMENT_TARGET_TYPE, ANNOUNCEMENT_TARGET_KIND, CLIENT_STATUS, PLAN_STATUS } = require('@app/Helpers/constants');
const Models = require('@app/Models');

// Turns the schools or plans picked in the Admin app (uuids) into internal ids, and back into names for display.
// Requests only ever carry uuids, never numeric ids.
//
// Schools are the `Client` model and plans are the `Plan` model. They are looked up by name from the models index;
// if one is ever missing, picking that audience answers 422 instead of failing.

const SOURCES = {
  [ANNOUNCEMENT_TARGET_TYPE.SCHOOLS]: { kind: ANNOUNCEMENT_TARGET_KIND.SCHOOL, model: 'Client', label: 'school' },
  [ANNOUNCEMENT_TARGET_TYPE.PLANS]: { kind: ANNOUNCEMENT_TARGET_KIND.PLAN, model: 'Plan', label: 'plan' },
};

const unavailable = () =>
  AppError.validation({ targetUuids: ['Choosing schools or plans is not available right now. Use "All schools".'] });

// returns { kind, ids } for the audience; All schools needs no targets
const resolve = async (targetType, uuids) => {
  const source = SOURCES[targetType];
  if (!source) return { kind: null, ids: [] };

  const Model = Models[source.model];
  if (!Model) throw unavailable();

  const list = Array.isArray(uuids) ? [...new Set(uuids)] : [];
  if (!list.length) throw AppError.validation({ targetUuids: [`Choose at least one ${source.label}.`] });
  if (list.length > 200) throw AppError.validation({ targetUuids: ['Too many items selected.'] });
  if (!list.every(isUuid)) throw AppError.validation({ targetUuids: ['One or more selected items are not valid.'] });

  const rows = await Model.findAll({ where: { uuid: list }, attributes: ['id'] });
  if (rows.length !== list.length) throw AppError.validation({ targetUuids: [`One or more selected ${source.label}s were not found.`] });

  return { kind: source.kind, ids: rows.map((row) => row.id) };
};

// [{ uuid, name }] for the stored targets of an announcement (empty when the model is not available yet)
const describe = async (targetType, targets = []) => {
  const source = SOURCES[targetType];
  const Model = source && Models[source.model];
  if (!Model || !targets.length) return [];

  const rows = await Model.findAll({ where: { id: targets.map((target) => target.targetId) }, attributes: ['uuid', 'name'] });
  return rows.map((row) => ({ uuid: row.uuid, name: row.name }));
};

// [{ announcementId, targets: [{ uuid, name }] }] for a page of announcements, with one query per audience kind
// (used by the list so every row can show who it is for without one query per row)
const describeMany = async (announcements) => {
  const ids = announcements.map((announcement) => announcement.id);
  const links = ids.length ? await Models.AnnouncementTarget.findAll({ where: { announcementId: ids } }) : [];

  const names = {};
  for (const source of Object.values(SOURCES)) {
    const Model = Models[source.model];
    const wanted = links.filter((link) => Number(link.targetKind) === source.kind).map((link) => link.targetId);
    names[source.kind] = new Map();
    if (!Model || !wanted.length) continue;

    const rows = await Model.findAll({ where: { id: wanted }, attributes: ['id', 'uuid', 'name'] });
    for (const row of rows) names[source.kind].set(String(row.id), { uuid: row.uuid, name: row.name });
  }

  const byAnnouncement = new Map(ids.map((id) => [String(id), []]));
  for (const link of links) {
    const found = names[Number(link.targetKind)]?.get(String(link.targetId));
    if (found) byAnnouncement.get(String(link.announcementId)).push(found);
  }
  return byAnnouncement;
};

const escapeLike = (text) => text.replace(/[\\%_]/g, (character) => `\\${character}`);

// What can be picked in the form: active schools or published plans, by name, at most 50 at a time.
// Served under the announcements permission so a person who may write announcements can always pick an audience.
const options = async (targetType, search) => {
  const source = SOURCES[targetType];
  const Model = source && Models[source.model];
  if (!Model) return [];

  const where = source.kind === ANNOUNCEMENT_TARGET_KIND.SCHOOL ? { status: CLIENT_STATUS.ACTIVE } : { status: PLAN_STATUS.PUBLISHED };
  if (search) where.name = { [Op.iLike]: `%${escapeLike(search)}%` };

  const rows = await Model.findAll({ where, attributes: ['uuid', 'name'], order: [['name', 'ASC']], limit: 50 });
  return rows.map((row) => ({ uuid: row.uuid, name: row.name }));
};

module.exports = { resolve, describe, describeMany, options };
