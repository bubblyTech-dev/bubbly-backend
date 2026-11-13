const { Op } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const password = require('@app/Helpers/password');
const { isUuid } = require('@app/Helpers/ref');
const { paginationParams } = require('@app/Helpers/pagination');
const { ADMIN_TYPE, ADMIN_STATUS, YES, NO } = require('@app/Helpers/constants');
const {
  AdminUser,
  AdminPermission,
  AdminUserPermission,
  AdminSession,
  AdminPasswordReset,
  AdminLoginHistory,
} = require('@app/Models');
const AdminUserResource = require('@app/Resources/V1/Admin/AdminUserResource');
const AdminSessionResource = require('@app/Resources/V1/Admin/AdminSessionResource');
const AdminLoginHistoryResource = require('@app/Resources/V1/Admin/AdminLoginHistoryResource');
const PermissionService = require('./PermissionService');

// Staff management (Users & Access). It manages STAFF only (type 2): master accounts are never listed or changed here.
//
// `actor` is req.admin (who is doing it). `context` is { admin, ip, userAgent } for the audit log.
// Every change runs in a transaction together with its audit row.

const AUDITED_FIELDS = ['name', 'email', 'phone', 'status'];

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

// % and _ typed by the user must not act as wildcards
const escapeLike = (value) => String(value).replace(/[\\%_]/g, '\\$&');

const findStaff = async (uuid, options = {}) => {
  if (!isUuid(uuid)) throw AppError.notFound('Staff member not found.');

  const staff = await AdminUser.findOne({ where: { uuid, type: ADMIN_TYPE.STAFF }, ...options });
  if (!staff) throw AppError.notFound('Staff member not found.');

  return staff;
};

// nobody changes their own status, permissions or password, and cannot delete themselves, through this module
const assertNotSelf = (actor, staff) => {
  if (String(actor.id) === String(staff.id)) {
    throw AppError.forbidden('You cannot do this to your own account.');
  }
};

const assertEmailFree = async (email, exceptId = null) => {
  const where = [sequelize.where(sequelize.fn('lower', sequelize.col('email')), email)];
  if (exceptId) where.push({ id: { [Op.ne]: exceptId } });

  const taken = await AdminUser.findOne({ where: { [Op.and]: where }, attributes: ['id'] });
  if (taken) throw AppError.validation({ email: ['This email is already used by another account.'] });
};

const revokeSessions = (adminUserId, revokedBy, transaction) =>
  AdminSession.update(
    { revokedAt: new Date(), revokedBy },
    { where: { adminUserId, revokedAt: null }, transaction },
  );

// ---- permissions ----------------------------------------------------------------------------------------------

// Works out and saves the permission set of a staff member.
//   - unknown keys are refused
//   - a master may grant anything
//   - anyone else may only grant keys they hold themselves; keys the staff member already has and the actor
//     does not hold are kept untouched
const applyPermissions = async (actor, staff, requested, transaction) => {
  const keys = [...new Set(requested)];
  if (keys.some((key) => typeof key !== 'string')) {
    throw AppError.validation({ permissions: ['The permission list is not valid.'] });
  }

  const known = await AdminPermission.findAll({ attributes: ['id', 'permissionKey'], transaction });
  const idByKey = new Map(known.map((row) => [row.permissionKey, row.id]));

  const unknown = keys.filter((key) => !idByKey.has(key));
  if (unknown.length) {
    throw AppError.validation({ permissions: [`Unknown permission: ${unknown.join(', ')}.`] });
  }

  const current = new Set(await PermissionService.keysFor(staff));
  const held = new Set(actor.isMaster ? [...idByKey.keys()] : actor.permissions);

  const notAllowed = keys.filter((key) => !held.has(key) && !current.has(key));
  if (notAllowed.length) {
    throw AppError.validation({ permissions: [`You cannot grant: ${notAllowed.join(', ')}.`] });
  }

  const final = new Set([
    ...[...current].filter((key) => !held.has(key)), // not the actor's to change: stays as it is
    ...keys.filter((key) => held.has(key)),
  ]);

  const toRemove = [...current].filter((key) => !final.has(key));
  const toAdd = [...final].filter((key) => !current.has(key));

  if (toRemove.length) {
    await AdminUserPermission.destroy({
      where: { adminUserId: staff.id, adminPermissionId: toRemove.map((key) => idByKey.get(key)) },
      transaction,
    });
  }
  if (toAdd.length) {
    await AdminUserPermission.bulkCreate(
      toAdd.map((key) => ({ adminUserId: staff.id, adminPermissionId: idByKey.get(key), grantedBy: actor.id })),
      { transaction },
    );
  }

  return { before: [...current].sort(), after: [...final].sort(), changed: toAdd.length + toRemove.length > 0 };
};

// ---- staff ------------------------------------------------------------------------------------------------------

const list = async (query) => {
  const { page, perPage, limit, offset } = paginationParams(query);
  const where = { type: ADMIN_TYPE.STAFF };

  if (query.status) where.status = Number(query.status);
  if (query.search) {
    const term = `%${escapeLike(query.search)}%`;
    where[Op.or] = ['name', 'email', 'phone'].map((field) => ({ [field]: { [Op.iLike]: term } }));
  }

  const { rows, count } = await AdminUser.findAndCountAll({
    where,
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });

  return AdminUserResource.paginate({ rows, count, page, perPage });
};

const show = async (uuid) => {
  const staff = await findStaff(uuid);
  return AdminUserResource.make(staff, { permissions: await PermissionService.keysFor(staff) });
};

const create = async (actor, context, data) => {
  const email = normalizeEmail(data.email);
  await assertEmailFree(email);

  const passwordHash = await password.hash(data.password);

  const { staff, keys } = await sequelize.transaction(async (transaction) => {
    const created = await AdminUser.create(
      {
        name: data.name,
        email,
        phone: data.phone ?? null,
        passwordHash,
        type: ADMIN_TYPE.STAFF,
        status: data.status ? Number(data.status) : ADMIN_STATUS.ACTIVE,
        mustChangePassword: YES,
        failedLoginCount: 0,
        passwordChangedAt: new Date(),
        createdBy: actor.id,
      },
      { transaction },
    );

    let permissionKeys = [];
    if (Array.isArray(data.permissions) && data.permissions.length) {
      permissionKeys = (await applyPermissions(actor, created, data.permissions, transaction)).after;
    }

    await Audit.log(context, 'admin_user.created', {
      entityType: 'admin_user',
      entityUuid: created.uuid,
      description: `Added staff ${created.name} (${created.email})`,
      after: { ...Audit.pick(created, AUDITED_FIELDS), permissions: permissionKeys },
    }, { transaction });

    return { staff: created, keys: permissionKeys };
  });

  return AdminUserResource.make(staff, { permissions: keys });
};

const update = async (actor, context, uuid, data) => {
  const staff = await findStaff(uuid);
  const changes = {};

  if (data.name !== undefined) changes.name = data.name;
  if (data.phone !== undefined) changes.phone = data.phone; // null clears it
  if (data.email !== undefined) {
    const email = normalizeEmail(data.email);
    if (email !== staff.email) {
      await assertEmailFree(email, staff.id);
      changes.email = email;
    }
  }

  if (Object.keys(changes).length) {
    const before = Audit.pick(staff, AUDITED_FIELDS);

    await sequelize.transaction(async (transaction) => {
      await staff.update(changes, { transaction });
      await Audit.log(context, 'admin_user.updated', {
        entityType: 'admin_user',
        entityUuid: staff.uuid,
        description: `Updated staff ${staff.name}`,
        before: Audit.pick(before, Object.keys(changes)),
        after: Audit.pick(staff, Object.keys(changes)),
      }, { transaction });
    });
  }

  return AdminUserResource.make(staff, { permissions: await PermissionService.keysFor(staff) });
};

const changeStatus = async (actor, context, uuid, { status }) => {
  const staff = await findStaff(uuid);
  assertNotSelf(actor, staff);

  const next = Number(status);
  if (Number(staff.status) !== next) {
    const before = { status: Number(staff.status) };

    await sequelize.transaction(async (transaction) => {
      const changes = { status: next };
      if (next === ADMIN_STATUS.ACTIVE) Object.assign(changes, { failedLoginCount: 0, lockedUntil: null });

      await staff.update(changes, { transaction });
      if (next === ADMIN_STATUS.INACTIVE) await revokeSessions(staff.id, actor.id, transaction);

      await Audit.log(context, 'admin_user.status_changed', {
        entityType: 'admin_user',
        entityUuid: staff.uuid,
        description: `${next === ADMIN_STATUS.ACTIVE ? 'Activated' : 'Deactivated'} staff ${staff.name}`,
        before,
        after: { status: next },
      }, { transaction });
    });
  }

  return AdminUserResource.make(staff, { permissions: await PermissionService.keysFor(staff) });
};

const resetPassword = async (actor, context, uuid, data) => {
  const staff = await findStaff(uuid);
  assertNotSelf(actor, staff);

  const passwordHash = await password.hash(data.password);

  await sequelize.transaction(async (transaction) => {
    const changes = {
      passwordHash,
      mustChangePassword: YES,
      passwordChangedAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
    };
    if (Number(staff.status) === ADMIN_STATUS.LOCKED) changes.status = ADMIN_STATUS.ACTIVE;

    await staff.update(changes, { transaction });
    await revokeSessions(staff.id, actor.id, transaction);
    await AdminPasswordReset.update({ usedAt: new Date() }, { where: { adminUserId: staff.id, usedAt: null }, transaction });

    await Audit.log(context, 'admin_user.password_reset', {
      entityType: 'admin_user',
      entityUuid: staff.uuid,
      description: `Set a new password for staff ${staff.name}`,
    }, { transaction });
  });
};

const setPermissions = async (actor, context, uuid, data) => {
  const staff = await findStaff(uuid);
  assertNotSelf(actor, staff);

  const result = await sequelize.transaction(async (transaction) => {
    const outcome = await applyPermissions(actor, staff, data.permissions, transaction);

    if (outcome.changed) {
      await Audit.log(context, 'admin_user.permissions_changed', {
        entityType: 'admin_user',
        entityUuid: staff.uuid,
        description: `Changed permissions of staff ${staff.name}`,
        before: { permissions: outcome.before },
        after: { permissions: outcome.after },
      }, { transaction });
    }

    return outcome;
  });

  return AdminUserResource.make(staff, { permissions: result.after });
};

const remove = async (actor, context, uuid) => {
  const staff = await findStaff(uuid);
  assertNotSelf(actor, staff);

  await sequelize.transaction(async (transaction) => {
    await revokeSessions(staff.id, actor.id, transaction);
    await staff.destroy({ transaction }); // soft delete: the row stays, the email becomes free

    await Audit.log(context, 'admin_user.deleted', {
      entityType: 'admin_user',
      entityUuid: staff.uuid,
      description: `Removed staff ${staff.name} (${staff.email})`,
      before: Audit.pick(staff, AUDITED_FIELDS),
    }, { transaction });
  });
};

// ---- sessions and login history -----------------------------------------------------------------------------

const listSessions = async (uuid) => {
  const staff = await findStaff(uuid);

  const sessions = await AdminSession.findAll({
    where: { adminUserId: staff.id, revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
    order: [['lastUsedAt', 'DESC'], ['id', 'DESC']],
  });

  return AdminSessionResource.collection(sessions);
};

const revokeSession = async (actor, context, uuid, sessionUuid) => {
  const staff = await findStaff(uuid);
  if (!isUuid(sessionUuid)) throw AppError.notFound('Session not found.');

  const session = await AdminSession.findOne({ where: { uuid: sessionUuid, adminUserId: staff.id, revokedAt: null } });
  if (!session) throw AppError.notFound('Session not found.');

  await sequelize.transaction(async (transaction) => {
    await session.update({ revokedAt: new Date(), revokedBy: actor.id }, { transaction });

    await Audit.log(context, 'admin_user.session_revoked', {
      entityType: 'admin_user',
      entityUuid: staff.uuid,
      description: `Ended a session of staff ${staff.name} (${session.deviceLabel || 'unknown device'})`,
    }, { transaction });
  });
};

const revokeAllSessions = async (actor, context, uuid) => {
  const staff = await findStaff(uuid);

  await sequelize.transaction(async (transaction) => {
    await revokeSessions(staff.id, actor.id, transaction);

    await Audit.log(context, 'admin_user.sessions_revoked', {
      entityType: 'admin_user',
      entityUuid: staff.uuid,
      description: `Ended all sessions of staff ${staff.name}`,
    }, { transaction });
  });
};

const loginHistory = async (uuid, query) => {
  const staff = await findStaff(uuid);
  const { page, perPage, limit, offset } = paginationParams(query);

  const { rows, count } = await AdminLoginHistory.findAndCountAll({
    where: { adminUserId: staff.id },
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });

  return AdminLoginHistoryResource.paginate({ rows, count, page, perPage });
};

module.exports = {
  list,
  show,
  create,
  update,
  changeStatus,
  resetPassword,
  setPermissions,
  remove,
  listSessions,
  revokeSession,
  revokeAllSessions,
  loginHistory,
};
