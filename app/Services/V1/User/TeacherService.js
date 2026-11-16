const { Op } = require('sequelize');
const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const { sequelize } = require('@app/Helpers/database');
const { paginationParams } = require('@app/Helpers/pagination');
const { contains, ensureWithinLimit, today, monthRange } = require('@app/Helpers/school');
const { User, TeacherProfile, SchoolClass, StaffAttendance, UserSession } = require('@app/Models');
const { CLASS_STATUS, STAFF_ATTENDANCE, USER_ROLE, USER_STATUS, YES } = require('@app/Helpers/constants');
const UserDirectory = require('@app/Services/V1/Common/UserDirectory');
const UserInviter = require('@app/Services/V1/Common/UserInviter');
const TeacherResource = require('@app/Resources/V1/User/TeacherResource');
const labels = require('@app/Resources/V1/User/labels');

// Teachers of the school. A teacher is a User (role Teacher) for the login plus a TeacherProfile for work details.
// The Principal adds them; the new teacher sets a password from a welcome link (shown once to the Principal too).
// Staff attendance (one row per teacher per day) is marked here by the Principal.

const USER_FIELDS = ['name', 'phone'];
const PROFILE_FIELDS = [
  'designation',
  'employeeCode',
  'qualification',
  'experienceYears',
  'joiningDate',
  'dateOfBirth',
  'gender',
  'emergencyContact',
  'address',
  'shiftStartsAt',
  'shiftEndsAt',
  'annualLeaveQuota',
];
const AUDIT_FIELDS = ['name', 'email', 'phone', 'status'];

const profileInclude = () => ({ model: TeacherProfile, as: 'teacherProfile', required: false });

const findTeacher = async (uuid, options = {}) => {
  const user = await User.findOne({ ...options, where: { uuid, role: USER_ROLE.TEACHER }, include: [profileInclude()] });
  if (!user) throw AppError.notFound();
  return user;
};

const activeTeacherCount = (transaction) => User.count({ where: { role: USER_ROLE.TEACHER, status: USER_STATUS.ACTIVE }, transaction });

// active classes of each teacher: { [userId]: [class, ...] }
const classesOf = async (userIds, transaction) => {
  if (!userIds.length) return {};
  const rows = await SchoolClass.findAll({
    where: { classTeacherId: userIds, status: CLASS_STATUS.ACTIVE },
    attributes: ['id', 'uuid', 'name', 'room', 'classTeacherId'],
    order: [
      ['sortOrder', 'ASC'],
      ['name', 'ASC'],
    ],
    transaction,
  });
  const map = {};
  for (const row of rows) (map[String(row.classTeacherId)] = map[String(row.classTeacherId)] || []).push(row);
  return map;
};

// attendance rows of one day: { [userId]: row }
const attendanceOn = async (userIds, date, transaction) => {
  if (!userIds.length) return {};
  const rows = await StaffAttendance.findAll({ where: { userId: userIds, date }, transaction });
  return Object.fromEntries(rows.map((row) => [String(row.userId), row]));
};

const monthSummary = async (userId, date, transaction) => {
  const { from, to } = monthRange(date);
  const rows = await StaffAttendance.findAll({ where: { userId, date: { [Op.between]: [from, to] } }, attributes: ['status'], transaction });
  const count = (status) => rows.filter((row) => Number(row.status) === status).length;
  const present = count(STAFF_ATTENDANCE.PRESENT) + count(STAFF_ATTENDANCE.LATE);
  const halfDay = count(STAFF_ATTENDANCE.HALF_DAY);
  const marked = rows.length;
  return {
    from,
    to,
    markedDays: marked,
    present,
    late: count(STAFF_ATTENDANCE.LATE),
    absent: count(STAFF_ATTENDANCE.ABSENT),
    onLeave: count(STAFF_ATTENDANCE.ON_LEAVE),
    halfDay,
    presentPercent: marked ? Math.round(((present + halfDay / 2) / marked) * 1000) / 10 : null,
  };
};

// replaces the set of classes this teacher is class teacher of (other teachers lose those classes)
const assignClasses = async (user, classUuids, transaction) => {
  const uuids = [...new Set(classUuids.map(String))];
  const classes = uuids.length ? await SchoolClass.findAll({ where: { uuid: uuids, status: CLASS_STATUS.ACTIVE }, transaction }) : [];
  if (classes.length !== uuids.length) throw AppError.validation({ classUuids: ['Choose active classes of your school.'] });

  await SchoolClass.update(
    { classTeacherId: null },
    { where: { classTeacherId: user.id, ...(classes.length ? { id: { [Op.notIn]: classes.map((c) => c.id) } } : {}) }, transaction },
  );
  if (classes.length) await SchoolClass.update({ classTeacherId: user.id }, { where: { id: classes.map((c) => c.id) }, transaction });
};

const profileValues = (data) => {
  const values = {};
  for (const field of PROFILE_FIELDS) if (data[field] !== undefined) values[field] = data[field] === '' ? null : data[field];
  if (values.gender !== undefined && values.gender !== null) values.gender = Number(values.gender);
  if (values.annualLeaveQuota !== undefined && values.annualLeaveQuota !== null) values.annualLeaveQuota = Number(values.annualLeaveQuota);
  if (values.experienceYears !== undefined && values.experienceYears !== null) values.experienceYears = Number(values.experienceYears);
  return values;
};

const detail = async (ctx, user, transaction) => {
  const date = today(ctx.client);
  const [classes, attendance] = await Promise.all([classesOf([user.id], transaction), attendanceOn([user.id], date, transaction)]);
  return TeacherResource.make(user, {
    classes: classes[String(user.id)] || [],
    todayAttendance: attendance[String(user.id)] || null,
    monthSummary: await monthSummary(user.id, date, transaction),
  });
};

const list = async (ctx, query) => {
  const { page, perPage, limit, offset } = paginationParams(query);
  const where = { role: USER_ROLE.TEACHER };
  if (query.status === 'all') {
    // every status
  } else if (query.status) where.status = Number(query.status);
  else where.status = USER_STATUS.ACTIVE;

  if (query.search) {
    const term = contains(query.search);
    where[Op.or] = [{ name: term }, { email: term }, { phone: term }];
  }

  const { rows, count } = await User.findAndCountAll({
    where,
    include: [profileInclude()],
    order: [
      ['name', 'ASC'],
      ['id', 'ASC'],
    ],
    limit,
    offset,
    distinct: true,
  });

  const ids = rows.map((row) => row.id);
  const date = today(ctx.client);
  const [classes, attendance] = await Promise.all([classesOf(ids), attendanceOn(ids, date)]);

  const result = TeacherResource.paginate({ rows, count, page, perPage });
  result.data = rows.map((row) =>
    TeacherResource.make(row, { classes: classes[String(row.id)] || [], todayAttendance: attendance[String(row.id)] || null }),
  );
  result.meta.date = date;
  return result;
};

// a short list for dropdowns (class teacher picker)
const options = async () => {
  const rows = await User.findAll({
    where: { role: USER_ROLE.TEACHER, status: USER_STATUS.ACTIVE },
    attributes: ['id', 'uuid', 'name'],
    order: [['name', 'ASC']],
    limit: 500,
  });
  return rows.map((row) => ({ uuid: row.uuid, name: row.name }));
};

const show = async (ctx, uuid) => detail(ctx, await findTeacher(uuid));

const create = async (ctx, data) =>
  sequelize.transaction(async (transaction) => {
    ensureWithinLimit(ctx.access, 'max_teachers', await activeTeacherCount(transaction), 'teachers');

    const email = UserDirectory.normalizeEmail(data.email);
    if (await UserDirectory.emailExists(email, { transaction })) {
      throw AppError.validation({ email: ['This email is already used by another login.'] });
    }

    const user = await User.create(
      {
        email,
        name: data.name,
        phone: data.phone || null,
        role: USER_ROLE.TEACHER,
        status: USER_STATUS.ACTIVE,
        mustChangePassword: YES,
        passwordHash: null,
        createdBy: ctx.user.id,
      },
      { transaction },
    );
    await TeacherProfile.create({ userId: user.id, ...profileValues(data) }, { transaction });
    if (Array.isArray(data.classUuids)) await assignClasses(user, data.classUuids, transaction);

    const link = await UserInviter.invite({ client: ctx.client, user, transaction });

    await Audit.log(
      ctx,
      'teacher.created',
      { entityType: 'user', entityUuid: user.uuid, description: `Added teacher ${user.name}`, after: Audit.pick(user, AUDIT_FIELDS) },
      { transaction },
    );

    await user.reload({ include: [profileInclude()], transaction });
    return { teacher: await detail(ctx, user, transaction), setPasswordUrl: link.setPasswordUrl };
  });

const update = async (ctx, uuid, data) =>
  sequelize.transaction(async (transaction) => {
    const user = await findTeacher(uuid, { transaction });
    const before = Audit.pick(user, AUDIT_FIELDS);

    const userChanges = {};
    for (const field of USER_FIELDS) if (data[field] !== undefined) userChanges[field] = data[field] || null;
    if (data.email !== undefined) {
      const email = UserDirectory.normalizeEmail(data.email);
      if (email !== user.email) {
        if (await UserDirectory.emailExists(email, { exceptUserId: user.id, transaction })) {
          throw AppError.validation({ email: ['This email is already used by another login.'] });
        }
        userChanges.email = email;
      }
    }
    if (Object.keys(userChanges).length) await user.update(userChanges, { transaction });

    const profileChanges = profileValues(data);
    if (Object.keys(profileChanges).length) {
      if (user.teacherProfile) await user.teacherProfile.update(profileChanges, { transaction });
      else await TeacherProfile.create({ userId: user.id, ...profileChanges }, { transaction });
    }
    if (Array.isArray(data.classUuids)) await assignClasses(user, data.classUuids, transaction);

    await Audit.log(
      ctx,
      'teacher.updated',
      { entityType: 'user', entityUuid: user.uuid, description: `Updated teacher ${user.name}`, before, after: Audit.pick(user, AUDIT_FIELDS) },
      { transaction },
    );

    await user.reload({ include: [profileInclude()], transaction });
    return detail(ctx, user, transaction);
  });

// Active <-> Inactive. Deactivating signs the teacher out everywhere and frees their classes.
const changeStatus = async (ctx, uuid, { status }) =>
  sequelize.transaction(async (transaction) => {
    const user = await findTeacher(uuid, { transaction });
    const next = Number(status);
    const previous = Number(user.status);
    if (user.id === ctx.user.id) throw AppError.forbidden('You cannot change your own status.');

    if (next !== previous) {
      if (next === USER_STATUS.ACTIVE) ensureWithinLimit(ctx.access, 'max_teachers', await activeTeacherCount(transaction), 'teachers');
      await user.update({ status: next, ...(next === USER_STATUS.ACTIVE ? { failedLoginCount: 0, lockedUntil: null } : {}) }, { transaction });
      if (next !== USER_STATUS.ACTIVE) {
        await UserSession.update({ revokedAt: new Date(), revokedBy: ctx.user.id }, { where: { userId: user.id, revokedAt: null }, transaction });
        await SchoolClass.update({ classTeacherId: null }, { where: { classTeacherId: user.id }, transaction });
      }
      await Audit.log(
        ctx,
        'teacher.status_changed',
        { entityType: 'user', entityUuid: user.uuid, description: `Changed the status of ${user.name}`, before: { status: previous }, after: { status: next } },
        { transaction },
      );
    }

    await user.reload({ include: [profileInclude()], transaction });
    return detail(ctx, user, transaction);
  });

// a fresh link to set (or reset) the password
const sendLoginLink = async (ctx, uuid) =>
  sequelize.transaction(async (transaction) => {
    const user = await findTeacher(uuid, { transaction });
    if (Number(user.status) !== USER_STATUS.ACTIVE) throw AppError.validation({ status: ['Activate this teacher first.'] });

    const link = await UserInviter.invite({ client: ctx.client, user, transaction });
    await Audit.log(
      ctx,
      'teacher.login_link_sent',
      { entityType: 'user', entityUuid: user.uuid, description: `Sent a login link to ${user.name}` },
      { transaction },
    );
    return { setPasswordUrl: link.setPasswordUrl, expiresAt: link.expiresAt };
  });

// Marks (or changes) one day of a teacher's attendance. A change to an earlier day is an attendance correction and
// is audit logged with the old and new status.
const markAttendance = async (ctx, uuid, data) =>
  sequelize.transaction(async (transaction) => {
    const user = await findTeacher(uuid, { transaction });
    const todayDate = today(ctx.client);
    const date = data.date || todayDate;
    if (date > todayDate) throw AppError.validation({ date: ['Attendance cannot be marked for a future day.'] });

    const status = Number(data.status);
    const existing = await StaffAttendance.findOne({ where: { userId: user.id, date }, transaction });
    const previous = existing ? Number(existing.status) : null;

    let row;
    if (existing) {
      row = await existing.update({ status, note: data.note === undefined ? existing.note : data.note || null, markedBy: ctx.user.id }, { transaction });
    } else {
      row = await StaffAttendance.create({ userId: user.id, date, status, note: data.note || null, markedBy: ctx.user.id }, { transaction });
    }

    if (previous !== status) {
      await Audit.log(
        ctx,
        existing ? 'staff_attendance.corrected' : 'staff_attendance.marked',
        {
          entityType: 'user',
          entityUuid: user.uuid,
          description: `${existing ? 'Changed' : 'Marked'} attendance of ${user.name} on ${date}: ${labels.staffAttendance[status]}`,
          before: existing ? { date, status: previous } : null,
          after: { date, status },
        },
        { transaction },
      );
    }

    return {
      date,
      status: Number(row.status),
      label: labels.staffAttendance[Number(row.status)],
      note: row.note || null,
      monthSummary: await monthSummary(user.id, date, transaction),
    };
  });

module.exports = { list, options, show, create, update, changeStatus, sendLoginLink, markAttendance, classesOf, attendanceOn };
