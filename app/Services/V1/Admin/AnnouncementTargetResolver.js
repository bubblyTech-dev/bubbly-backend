const AppError = require('@app/Helpers/AppError');
const { isUuid } = require('@app/Helpers/ref');
const { ANNOUNCEMENT_TARGET_TYPE, ANNOUNCEMENT_TARGET_KIND } = require('@app/Helpers/constants');
const Models = require('@app/Models');

// Turns the schools or plans picked in the Admin app (uuids) into internal ids, and back into names for display.
// Requests only ever carry uuids, never numeric ids.
//
// Schools are the `Client` model and plans are the `Plan` model. They are built by other modules, so this file
// looks them up by name: when a model is not available yet, picking that audience answers 422. Once those modules
// are merged the same code starts working with no change.

const SOURCES = {
  [ANNOUNCEMENT_TARGET_TYPE.SCHOOLS]: { kind: ANNOUNCEMENT_TARGET_KIND.SCHOOL, model: 'Client', label: 'school' },
  [ANNOUNCEMENT_TARGET_TYPE.PLANS]: { kind: ANNOUNCEMENT_TARGET_KIND.PLAN, model: 'Plan', label: 'plan' },
};

const unavailable = () =>
  AppError.validation({ targetUuids: ['Choosing schools or plans is not available yet. Use "All schools" for now.'] });

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

module.exports = { resolve, describe };
