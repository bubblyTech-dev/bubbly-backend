const { DataTypes, Op } = require('sequelize');
const context = require('@app/Helpers/context');
const defineModel = require('./BaseModel');

// A model for data that belongs to ONE school. Same as defineModel plus a `clientId` column that is:
//   - filled automatically from the current tenant context when a row is created,
//   - added to every find, count, bulk update and bulk destroy (including included tenant models),
//   - never changeable afterwards.
// Using such a model outside a tenant context throws, unless the code runs inside context.runWithoutTenant(reason, fn).
//
//   const User = defineTenantModel('User', 'users', { email: ... }, { paranoid: true });
//
// Banned on tenant models: raw queries, unscoped(), upsert, increment, decrement.

const missingContext = (model, action) =>
  new Error(`${model.name}.${action} was used outside a tenant context. Run it inside a school request or context.runWithoutTenant(reason, fn).`);

// the filter uses the real column name (client_id): Sequelize maps attribute names to columns only for some queries
const columnOf = (model) => model.rawAttributes.clientId.field || 'client_id';

const withClient = (model, where, clientId) => {
  const filter = { [columnOf(model)]: clientId };
  return where && (Object.keys(where).length || Object.getOwnPropertySymbols(where).length) ? { [Op.and]: [where, filter] } : filter;
};

// scopes a query object and, one level at a time, the tenant models it includes
const scopeOptions = (model, options, action) => {
  if (context.isBypassed()) return;
  const clientId = context.clientId();
  if (!clientId) throw missingContext(model, action);

  options.where = withClient(model, options.where, clientId);

  const scopeIncludes = (includes) => {
    for (const include of includes || []) {
      if (include && include.model && include.model.isTenantModel) {
        include.where = withClient(include.model, include.where, clientId);
      }
      if (include && include.include) scopeIncludes(include.include);
    }
  };
  scopeIncludes(options.include);
};

const defineTenantModel = (name, tableName, attributes, options = {}) => {
  const Model = defineModel(
    name,
    tableName,
    {
      clientId: { type: DataTypes.BIGINT },
      ...attributes,
    },
    options,
  );

  Model.isTenantModel = true;

  Model.addHook('beforeFind', 'tenantFind', (findOptions) => scopeOptions(Model, findOptions, 'find'));
  Model.addHook('beforeCount', 'tenantCount', (countOptions) => scopeOptions(Model, countOptions, 'count'));
  Model.addHook('beforeBulkUpdate', 'tenantBulkUpdate', (updateOptions) => {
    if (updateOptions.attributes && Object.prototype.hasOwnProperty.call(updateOptions.attributes, 'clientId')) {
      throw new Error(`${name}: the school of a row can never be changed.`);
    }
    scopeOptions(Model, updateOptions, 'update');
  });
  Model.addHook('beforeBulkDestroy', 'tenantBulkDestroy', (destroyOptions) => scopeOptions(Model, destroyOptions, 'destroy'));

  // a new row gets its school from the context; a different school in the data is refused.
  // (beforeCreate, not beforeValidate: Model.update builds a throw-away instance that must not be touched)
  Model.addHook('beforeCreate', 'tenantAssign', (instance) => {
    if (context.isBypassed()) return; // the caller sets clientId itself (or leaves it empty, e.g. a failed login)
    const clientId = context.clientId();
    if (!clientId) throw missingContext(Model, 'create');
    if (instance.clientId !== null && instance.clientId !== undefined && String(instance.clientId) !== String(clientId)) {
      throw new Error(`${name}: tried to create a row for another school.`);
    }
    instance.clientId = clientId;
  });
  Model.addHook('beforeBulkCreate', 'tenantBulkAssign', (instances) => {
    if (context.isBypassed()) return;
    const clientId = context.clientId();
    if (!clientId) throw missingContext(Model, 'bulkCreate');
    for (const instance of instances) {
      if (instance.clientId !== null && instance.clientId !== undefined && String(instance.clientId) !== String(clientId)) {
        throw new Error(`${name}: tried to create a row for another school.`);
      }
      instance.clientId = clientId;
    }
  });

  // an instance may only be saved or removed by the school it belongs to
  const ownRow = (instance) => {
    if (context.isBypassed()) return;
    const clientId = context.clientId();
    if (!clientId) throw missingContext(Model, 'save');
    if (instance.changed('clientId') && !instance.isNewRecord) throw new Error(`${name}: the school of a row can never be changed.`);
    if (String(instance.clientId) !== String(clientId)) throw new Error(`${name}: this row belongs to another school.`);
  };
  Model.addHook('beforeUpdate', 'tenantOwnUpdate', ownRow);
  Model.addHook('beforeDestroy', 'tenantOwnDestroy', ownRow);

  const banned = (method) => () => {
    throw new Error(`${name}.${method} is not allowed on school-owned models.`);
  };
  Model.unscoped = banned('unscoped');
  Model.upsert = banned('upsert');
  Model.increment = banned('increment');
  Model.decrement = banned('decrement');

  return Model;
};

module.exports = defineTenantModel;
