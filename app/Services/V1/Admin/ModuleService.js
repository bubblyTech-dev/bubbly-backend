const { sequelize } = require('@app/Helpers/database');
const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const { findOrFail } = require('@app/Helpers/ref');
const { AppModule } = require('@app/Models');
const { MODULE_STATUS, YES } = require('@app/Helpers/constants');
const ModuleResource = require('@app/Resources/V1/Admin/ModuleResource');

const snapshot = (module) => ({
  name: module.name,
  description: module.description,
  status: Number(module.status),
  sortOrder: module.sortOrder,
});

const list = async () => {
  const modules = await AppModule.findAll({ order: [['sortOrder', 'ASC'], ['id', 'ASC']] });
  return ModuleResource.collection(modules);
};

// the module key never changes; a core module is part of every plan, so it cannot be switched off
const update = async (ctx, uuid, data) =>
  sequelize.transaction(async (transaction) => {
    const module = await findOrFail(AppModule, uuid, { transaction });
    const before = snapshot(module);

    if (data.status !== undefined && Number(data.status) === MODULE_STATUS.INACTIVE && Number(module.isCore) === YES) {
      throw AppError.validation({ status: ['A core module is part of every plan and cannot be made inactive.'] });
    }

    const changes = {};
    if (data.name !== undefined) changes.name = data.name;
    if (data.description !== undefined) changes.description = data.description;
    if (data.status !== undefined) changes.status = Number(data.status);
    if (data.sortOrder !== undefined) changes.sortOrder = Number(data.sortOrder);

    await module.update(changes, { transaction });

    await Audit.log(
      ctx,
      'module.updated',
      { entityType: 'module', entityUuid: module.uuid, description: `Updated module "${module.name}"`, before, after: snapshot(module) },
      { transaction },
    );
    return ModuleResource.make(module);
  });

module.exports = { list, update };
