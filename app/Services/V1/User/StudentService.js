const { Op } = require('sequelize');
const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const { sequelize } = require('@app/Helpers/database');
const { findOrFail } = require('@app/Helpers/ref');
const { paginationParams } = require('@app/Helpers/pagination');
const { contains, ensureWithinLimit } = require('@app/Helpers/school');
const { Student, SchoolClass, User, UserSession } = require('@app/Models');
const { CLASS_STATUS, STUDENT_STATUS, USER_ROLE, USER_STATUS, YES } = require('@app/Helpers/constants');
const UserDirectory = require('@app/Services/V1/Common/UserDirectory');
const UserInviter = require('@app/Services/V1/Common/UserInviter');
const StudentResource = require('@app/Resources/V1/User/StudentResource');

// Students of the school. The Principal manages them; a Teacher sees (read only) the students of the classes they teach.
//
// Parent app login: a User with role Student, linked through students.user_id. Its email is the guardian's email and
// must be unique across ALL schools (UserDirectory). It has no password until the parent opens the welcome link.

const AUDIT_FIELDS = [
  'name',
  'admissionNo',
  'classId',
  'dateOfBirth',
  'gender',
  'bloodGroup',
  'guardianName',
  'guardianRelation',
  'guardianPhone',
  'guardianEmail',
  'status',
];

const PLAIN_FIELDS = [
  'name',
  'admissionNo',
  'dateOfBirth',
  'gender',
  'bloodGroup',
  'address',
  'medicalNotes',
  'guardianName',
  'guardianRelation',
  'guardianPhone',
  'secondGuardianName',
  'secondGuardianPhone',
  'admissionDate',
];

const includes = () => [
  {
    model: SchoolClass,
    as: 'schoolClass',
    attributes: ['id', 'uuid', 'name', 'classTeacherId'],
    required: false,
    include: [{ model: User, as: 'classTeacher', attributes: ['id', 'uuid', 'name'], required: false }],
  },
  { model: User, as: 'login', attributes: ['id', 'uuid', 'email', 'status', 'passwordHash', 'lastLoginAt'], required: false },
];

const present = (row) =>
  StudentResource.make(row, {
    classTeacher:
      row.schoolClass && row.schoolClass.classTeacher ? { uuid: row.schoolClass.classTeacher.uuid, name: row.schoolClass.classTeacher.name } : null,
  });

// ids of the classes a Teacher teaches (null = no restriction, for the Principal)
const visibleClassIds = async (ctx) => {
  if (ctx.user.role !== USER_ROLE.TEACHER) return null;
  const rows = await SchoolClass.findAll({ where: { classTeacherId: ctx.user.id }, attributes: ['id'] });
  return rows.map((row) => row.id);
};

const findVisible = async (ctx, uuid, options = {}) => {
  const row = await findOrFail(Student, uuid, { ...options, include: includes() });
  const allowed = await visibleClassIds(ctx);
  if (allowed && !allowed.some((id) => String(id) === String(row.classId))) throw AppError.notFound();
  return row;
};

const resolveClassId = async (classUuid, transaction) => {
  if (classUuid === null || classUuid === undefined) return null;
  const row = await SchoolClass.findOne({ where: { uuid: classUuid }, transaction });
  if (!row) throw AppError.validation({ classUuid: ['Choose a class of your school.'] });
  if (Number(row.status) !== CLASS_STATUS.ACTIVE) throw AppError.validation({ classUuid: ['This class is archived.'] });
  return row.id;
};

const normalizeEmail = (email) => (email ? UserDirectory.normalizeEmail(email) : null);

const ensureEmailFree = async (email, { exceptUserId, transaction } = {}) => {
  if (await UserDirectory.emailExists(email, { exceptUserId, transaction })) {
    throw AppError.validation({ guardianEmail: ['This email is already used by another login. Use a different email for this parent.'] });
  }
};

const signOutEverywhere = (userId, revokedBy, transaction) =>
  UserSession.update({ revokedAt: new Date(), revokedBy }, { where: { userId, revokedAt: null }, transaction });

// creates the parent login of a student (no password yet) and returns the welcome link
const createLogin = async (ctx, student, transaction) => {
  const email = normalizeEmail(student.guardianEmail);
  if (!email) throw AppError.validation({ guardianEmail: ['Add the parent email first: it is their login.'] });
  await ensureEmailFree(email, { transaction });

  const user = await User.create(
    {
      email,
      name: student.guardianName || student.name,
      phone: student.guardianPhone || null,
      role: USER_ROLE.STUDENT,
      status: USER_STATUS.ACTIVE,
      mustChangePassword: YES,
      passwordHash: null,
      createdBy: ctx.user.id,
    },
    { transaction },
  );
  await student.update({ userId: user.id }, { transaction });
  return { user, link: await UserInviter.invite({ client: ctx.client, user, transaction }) };
};

const list = async (ctx, query) => {
  const { page, perPage, limit, offset } = paginationParams(query);
  const where = {};

  if (query.status === 'all') {
    // every status
  } else if (query.status) where.status = Number(query.status);
  else where.status = STUDENT_STATUS.ACTIVE;

  const allowed = await visibleClassIds(ctx);
  if (query.classUuid) {
    const schoolClass = await SchoolClass.findOne({ where: { uuid: query.classUuid }, attributes: ['id'] });
    if (!schoolClass || (allowed && !allowed.some((id) => String(id) === String(schoolClass.id)))) throw AppError.notFound();
    where.classId = schoolClass.id;
  } else if (allowed) {
    where.classId = allowed;
  }

  if (query.search) {
    const term = contains(query.search);
    where[Op.or] = [{ name: term }, { guardianName: term }, { guardianPhone: term }, { admissionNo: term }];
  }

  const { rows, count } = await Student.findAndCountAll({
    where,
    include: includes(),
    order: [
      ['name', 'ASC'],
      ['id', 'ASC'],
    ],
    limit,
    offset,
    distinct: true,
  });

  const result = StudentResource.paginate({ rows, count, page, perPage });
  result.data = rows.map(present);
  return result;
};

const show = async (ctx, uuid) => present(await findVisible(ctx, uuid));

const create = async (ctx, data) =>
  sequelize.transaction(async (transaction) => {
    const activeCount = await Student.count({ where: { status: STUDENT_STATUS.ACTIVE }, transaction });
    ensureWithinLimit(ctx.access, 'max_students', activeCount, 'students');

    const values = { status: STUDENT_STATUS.ACTIVE, createdBy: ctx.user.id };
    for (const field of PLAIN_FIELDS) if (data[field] !== undefined) values[field] = data[field];
    values.classId = await resolveClassId(data.classUuid, transaction);
    values.guardianEmail = normalizeEmail(data.guardianEmail);
    if (values.gender !== undefined && values.gender !== null) values.gender = Number(values.gender);

    const student = await Student.create(values, { transaction });

    let link = null;
    if (data.createParentLogin === true || data.createParentLogin === 'true' || data.createParentLogin === 1 || data.createParentLogin === '1') {
      ({ link } = await createLogin(ctx, student, transaction));
    }

    await Audit.log(
      ctx,
      'student.created',
      {
        entityType: 'student',
        entityUuid: student.uuid,
        description: `Added student ${student.name}${link ? ' with a parent login' : ''}`,
        after: Audit.pick(student, AUDIT_FIELDS),
      },
      { transaction },
    );

    await student.reload({ include: includes(), transaction });
    return { student: present(student), setPasswordUrl: link ? link.setPasswordUrl : null };
  });

const update = async (ctx, uuid, data) =>
  sequelize.transaction(async (transaction) => {
    const student = await findVisible(ctx, uuid, { transaction });
    const before = Audit.pick(student, AUDIT_FIELDS);
    const changes = {};

    for (const field of PLAIN_FIELDS) if (data[field] !== undefined) changes[field] = data[field];
    if (changes.gender !== undefined && changes.gender !== null) changes.gender = Number(changes.gender);
    if (data.classUuid !== undefined) changes.classId = await resolveClassId(data.classUuid, transaction);

    if (data.guardianEmail !== undefined) {
      const email = normalizeEmail(data.guardianEmail);
      if (email !== student.guardianEmail) {
        if (student.userId) {
          // the login follows the guardian email
          if (!email) throw AppError.validation({ guardianEmail: ['This student has a parent login, so the email cannot be removed.'] });
          await ensureEmailFree(email, { exceptUserId: student.userId, transaction });
          await User.update({ email }, { where: { id: student.userId }, transaction });
        }
        changes.guardianEmail = email;
      }
    }
    if (student.userId && (changes.guardianName !== undefined || changes.guardianPhone !== undefined)) {
      const loginChanges = {};
      if (changes.guardianName !== undefined) loginChanges.name = changes.guardianName || student.name;
      if (changes.guardianPhone !== undefined) loginChanges.phone = changes.guardianPhone || null;
      await User.update(loginChanges, { where: { id: student.userId }, transaction });
    }

    if (Object.keys(changes).length) {
      await student.update(changes, { transaction });
      await Audit.log(
        ctx,
        'student.updated',
        { entityType: 'student', entityUuid: student.uuid, description: `Updated student ${student.name}`, before, after: Audit.pick(student, AUDIT_FIELDS) },
        { transaction },
      );
    }

    await student.reload({ include: includes(), transaction });
    return present(student);
  });

// Active / Inactive / Left. Leaving or deactivating also switches the parent login off and signs it out.
const changeStatus = async (ctx, uuid, { status }) =>
  sequelize.transaction(async (transaction) => {
    const student = await findVisible(ctx, uuid, { transaction });
    const next = Number(status);
    const previous = Number(student.status);
    if (next === previous) return present(student);

    if (next === STUDENT_STATUS.ACTIVE) {
      const activeCount = await Student.count({ where: { status: STUDENT_STATUS.ACTIVE }, transaction });
      ensureWithinLimit(ctx.access, 'max_students', activeCount, 'students');
    }

    await student.update({ status: next }, { transaction });
    if (student.userId) {
      await User.update(
        { status: next === STUDENT_STATUS.ACTIVE ? USER_STATUS.ACTIVE : USER_STATUS.INACTIVE },
        { where: { id: student.userId }, transaction },
      );
      if (next !== STUDENT_STATUS.ACTIVE) await signOutEverywhere(student.userId, ctx.user.id, transaction);
    }

    await Audit.log(
      ctx,
      'student.status_changed',
      {
        entityType: 'student',
        entityUuid: student.uuid,
        description: `Changed the status of ${student.name}`,
        before: { status: previous },
        after: { status: next },
      },
      { transaction },
    );

    await student.reload({ include: includes(), transaction });
    return present(student);
  });

// creates the parent login, or sends a fresh link when it already exists
const parentLogin = async (ctx, uuid) =>
  sequelize.transaction(async (transaction) => {
    const student = await findVisible(ctx, uuid, { transaction });
    if (Number(student.status) !== STUDENT_STATUS.ACTIVE) {
      throw AppError.validation({ status: ['Only an active student can have a parent login.'] });
    }

    let link;
    let action;
    if (!student.userId) {
      ({ link } = await createLogin(ctx, student, transaction));
      action = 'student.parent_login_created';
    } else {
      const user = await User.findByPk(student.userId, { transaction });
      if (!user) throw AppError.notFound();
      if (Number(user.status) !== USER_STATUS.ACTIVE) await user.update({ status: USER_STATUS.ACTIVE }, { transaction });
      link = await UserInviter.invite({ client: ctx.client, user, transaction });
      action = 'student.parent_login_link_sent';
    }

    await Audit.log(
      ctx,
      action,
      { entityType: 'student', entityUuid: student.uuid, description: `Sent a parent login link for ${student.name}` },
      { transaction },
    );

    await student.reload({ include: includes(), transaction });
    return { student: present(student), setPasswordUrl: link.setPasswordUrl };
  });

// soft delete; the parent login goes with it
const destroy = async (ctx, uuid) =>
  sequelize.transaction(async (transaction) => {
    const student = await findVisible(ctx, uuid, { transaction });
    if (student.userId) {
      await signOutEverywhere(student.userId, ctx.user.id, transaction);
      await User.destroy({ where: { id: student.userId }, transaction });
    }
    await student.destroy({ transaction });

    await Audit.log(
      ctx,
      'student.deleted',
      { entityType: 'student', entityUuid: student.uuid, description: `Deleted student ${student.name}`, before: Audit.pick(student, AUDIT_FIELDS) },
      { transaction },
    );
  });

module.exports = { list, show, create, update, changeStatus, parentLogin, destroy };
