const { Op } = require('sequelize');
const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const { sequelize } = require('@app/Helpers/database');
const { findOrFail } = require('@app/Helpers/ref');
const { paginationParams } = require('@app/Helpers/pagination');
const { contains, equalsIgnoreCase, ensureWithinLimit } = require('@app/Helpers/school');
const { SchoolClass, Student, User } = require('@app/Models');
const { CLASS_STATUS, STUDENT_STATUS, USER_ROLE, USER_STATUS } = require('@app/Helpers/constants');
const ClassResource = require('@app/Resources/V1/User/ClassResource');

// Classes of the school (Principal manages them; a Teacher only sees the classes they teach).
// Every query runs inside the school's tenant context, so client_id is never handled here.

const AUDIT_FIELDS = ['name', 'code', 'room', 'startsAt', 'endsAt', 'capacity', 'classTeacherId', 'status', 'sortOrder'];

const teacherInclude = () => ({ model: User, as: 'classTeacher', attributes: ['id', 'uuid', 'name'], required: false });

// a Teacher only ever sees their own classes
const visibleWhere = (ctx) => (ctx.user.role === USER_ROLE.TEACHER ? { classTeacherId: ctx.user.id } : {});

// active students per class: { [classId]: count }
const studentCounts = async (classIds) => {
  if (!classIds.length) return {};
  const rows = await Student.count({
    where: { classId: classIds, status: STUDENT_STATUS.ACTIVE },
    group: ['classId'],
  });
  return Object.fromEntries(rows.map((row) => [String(row.classId), Number(row.count)]));
};

const findVisible = async (ctx, uuid, options = {}) => {
  const row = await findOrFail(SchoolClass, uuid, { ...options, include: [teacherInclude()] });
  if (ctx.user.role === USER_ROLE.TEACHER && String(row.classTeacherId) !== String(ctx.user.id)) throw AppError.notFound();
  return row;
};

// uuid of a teacher of this school -> the teacher's internal id (null clears the class teacher)
const resolveTeacherId = async (teacherUuid, transaction) => {
  if (teacherUuid === null) return null;
  const teacher = await User.findOne({ where: { uuid: teacherUuid, role: USER_ROLE.TEACHER }, transaction });
  if (!teacher) throw AppError.validation({ classTeacherUuid: ['Choose a teacher of your school.'] });
  if (Number(teacher.status) !== USER_STATUS.ACTIVE) throw AppError.validation({ classTeacherUuid: ['This teacher is not active.'] });
  return teacher.id;
};

const ensureUniqueName = async (name, { exceptId, transaction } = {}) => {
  const clash = await SchoolClass.findOne({
    where: { name: equalsIgnoreCase(name), ...(exceptId ? { id: { [Op.ne]: exceptId } } : {}) },
    transaction,
  });
  if (clash) throw AppError.validation({ name: ['A class with this name already exists.'] });
};

const list = async (ctx, query) => {
  const { page, perPage, limit, offset } = paginationParams({ perPage: 50, ...query });
  const where = { ...visibleWhere(ctx) };
  if (query.status === 'all') {
    // every status
  } else if (query.status) where.status = Number(query.status);
  else where.status = CLASS_STATUS.ACTIVE;
  if (query.search) where.name = contains(query.search);

  const { rows, count } = await SchoolClass.findAndCountAll({
    where,
    include: [teacherInclude()],
    order: [
      ['sortOrder', 'ASC'],
      ['name', 'ASC'],
    ],
    limit,
    offset,
    distinct: true,
  });

  const counts = await studentCounts(rows.map((row) => row.id));
  const result = ClassResource.paginate({ rows, count, page, perPage });
  result.data = rows.map((row) => ClassResource.make(row, { studentCount: counts[String(row.id)] || 0 }));

  // the total of active students in the classes this person can see (header of the Classes page)
  const totalStudents =
    ctx.user.role === USER_ROLE.TEACHER
      ? Object.values(await studentCounts((await SchoolClass.findAll({ where: visibleWhere(ctx), attributes: ['id'] })).map((c) => c.id))).reduce(
          (sum, n) => sum + n,
          0,
        )
      : await Student.count({ where: { status: STUDENT_STATUS.ACTIVE } });
  result.meta.totalStudents = totalStudents;
  return result;
};

// a short list for dropdowns (active classes only, no paging needed: a preschool has a handful of classes)
const options = async (ctx) => {
  const rows = await SchoolClass.findAll({
    where: { ...visibleWhere(ctx), status: CLASS_STATUS.ACTIVE },
    attributes: ['id', 'uuid', 'name'],
    order: [
      ['sortOrder', 'ASC'],
      ['name', 'ASC'],
    ],
    limit: 200,
  });
  return rows.map((row) => ({ uuid: row.uuid, name: row.name }));
};

const show = async (ctx, uuid) => {
  const row = await findVisible(ctx, uuid);
  const counts = await studentCounts([row.id]);
  return ClassResource.make(row, { studentCount: counts[String(row.id)] || 0 });
};

const create = async (ctx, data) =>
  sequelize.transaction(async (transaction) => {
    const activeCount = await SchoolClass.count({ where: { status: CLASS_STATUS.ACTIVE }, transaction });
    ensureWithinLimit(ctx.access, 'max_classes', activeCount, 'classes');
    await ensureUniqueName(data.name, { transaction });

    const last = await SchoolClass.findOne({ order: [['sortOrder', 'DESC']], attributes: ['sortOrder'], transaction });
    const row = await SchoolClass.create(
      {
        name: data.name,
        code: data.code || null,
        room: data.room || null,
        startsAt: data.startsAt || null,
        endsAt: data.endsAt || null,
        capacity: data.capacity === undefined || data.capacity === null ? null : Number(data.capacity),
        classTeacherId: data.classTeacherUuid ? await resolveTeacherId(data.classTeacherUuid, transaction) : null,
        status: CLASS_STATUS.ACTIVE,
        sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : Number(last ? last.sortOrder : 0) + 10,
        createdBy: ctx.user.id,
      },
      { transaction },
    );

    await Audit.log(
      ctx,
      'class.created',
      { entityType: 'class', entityUuid: row.uuid, description: `Added class ${row.name}`, after: Audit.pick(row, AUDIT_FIELDS) },
      { transaction },
    );

    await row.reload({ include: [teacherInclude()], transaction });
    return ClassResource.make(row, { studentCount: 0 });
  });

const update = async (ctx, uuid, data) =>
  sequelize.transaction(async (transaction) => {
    const row = await findVisible(ctx, uuid, { transaction });
    const before = Audit.pick(row, AUDIT_FIELDS);
    const changes = {};

    if (data.name !== undefined && data.name !== row.name) {
      await ensureUniqueName(data.name, { exceptId: row.id, transaction });
      changes.name = data.name;
    }
    for (const field of ['code', 'room', 'startsAt', 'endsAt']) {
      if (data[field] !== undefined) changes[field] = data[field] || null;
    }
    if (data.capacity !== undefined) changes.capacity = data.capacity === null ? null : Number(data.capacity);
    if (data.sortOrder !== undefined) changes.sortOrder = Number(data.sortOrder);
    if (data.classTeacherUuid !== undefined) changes.classTeacherId = await resolveTeacherId(data.classTeacherUuid, transaction);

    if (data.status !== undefined && Number(data.status) !== Number(row.status)) {
      const status = Number(data.status);
      if (status === CLASS_STATUS.ARCHIVED) {
        const enrolled = await Student.count({ where: { classId: row.id, status: STUDENT_STATUS.ACTIVE }, transaction });
        if (enrolled) throw AppError.validation({ status: [`Move the ${enrolled} active student(s) to another class before archiving this class.`] });
      } else {
        const activeCount = await SchoolClass.count({ where: { status: CLASS_STATUS.ACTIVE }, transaction });
        ensureWithinLimit(ctx.access, 'max_classes', activeCount, 'classes');
      }
      changes.status = status;
    }

    if (Object.keys(changes).length) {
      await row.update(changes, { transaction });
      await Audit.log(
        ctx,
        'class.updated',
        { entityType: 'class', entityUuid: row.uuid, description: `Updated class ${row.name}`, before, after: Audit.pick(row, AUDIT_FIELDS) },
        { transaction },
      );
    }

    await row.reload({ include: [teacherInclude()], transaction });
    const counts = await studentCounts([row.id]);
    return ClassResource.make(row, { studentCount: counts[String(row.id)] || 0 });
  });

// only a class that never had students can be deleted; otherwise archive it
const destroy = async (ctx, uuid) =>
  sequelize.transaction(async (transaction) => {
    const row = await findVisible(ctx, uuid, { transaction });
    const students = await Student.count({ where: { classId: row.id }, transaction });
    if (students) throw new AppError(409, 'This class has students. Archive it instead of deleting it.', { code: 'CLASS_HAS_STUDENTS' });

    await row.destroy({ transaction });
    await Audit.log(
      ctx,
      'class.deleted',
      { entityType: 'class', entityUuid: row.uuid, description: `Deleted class ${row.name}`, before: Audit.pick(row, AUDIT_FIELDS) },
      { transaction },
    );
  });

module.exports = { list, options, show, create, update, destroy, studentCounts };
