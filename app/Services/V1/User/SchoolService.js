const Audit = require('@app/Helpers/audit');
const { sequelize } = require('@app/Helpers/database');
const { today } = require('@app/Helpers/school');
const { Client, Student, User, SchoolClass } = require('@app/Models');
const { CLASS_STATUS, STUDENT_STATUS, USER_ROLE, USER_STATUS } = require('@app/Helpers/constants');
const SchoolResource = require('@app/Resources/V1/User/SchoolResource');
const SubscriptionSummaryResource = require('@app/Resources/V1/User/SubscriptionSummaryResource');

// The school's own details and settings (Principal, Profile page), plus how much of the plan it uses.
// `clients` is a platform table (not tenant scoped), so the row is always looked up by req.client.id.

const EDITABLE = ['name', 'contactPhone', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode'];
const AUDIT_FIELDS = [...EDITABLE, 'workingDays', 'opensAt', 'closesAt', 'academicYearStartMonth'];

const usage = async (access) => {
  const [students, teachers, classes] = await Promise.all([
    Student.count({ where: { status: STUDENT_STATUS.ACTIVE } }),
    User.count({ where: { role: USER_ROLE.TEACHER, status: USER_STATUS.ACTIVE } }),
    SchoolClass.count({ where: { status: CLASS_STATUS.ACTIVE } }),
  ]);
  const limit = (key) => (access.limits && access.limits[key] !== undefined ? access.limits[key] : null);
  return {
    students: { used: students, limit: limit('max_students') },
    teachers: { used: teachers, limit: limit('max_teachers') },
    classes: { used: classes, limit: limit('max_classes') },
    storageMb: { used: null, limit: limit('storage_mb') },
  };
};

const show = async (ctx) => {
  const client = await Client.findByPk(ctx.client.id);
  return {
    school: SchoolResource.make(client, { today: today(client) }),
    subscription: SubscriptionSummaryResource.make(ctx.access),
    modules: [...ctx.access.moduleKeys].sort(),
    usage: await usage(ctx.access),
  };
};

const update = async (ctx, data) =>
  sequelize.transaction(async (transaction) => {
    const client = await Client.findByPk(ctx.client.id, { transaction });
    const before = Audit.pick(client, AUDIT_FIELDS);
    const changes = {};

    for (const field of EDITABLE) if (data[field] !== undefined) changes[field] = data[field] || null;
    if (changes.name === null) delete changes.name; // the name can change but never be emptied
    if (Array.isArray(data.workingDays)) {
      changes.workingDays = [...new Set(data.workingDays.map(Number))]
        .filter((d) => d >= 1 && d <= 7)
        .sort()
        .join(',');
    }
    if (data.opensAt !== undefined) changes.opensAt = data.opensAt || null;
    if (data.closesAt !== undefined) changes.closesAt = data.closesAt || null;
    if (data.academicYearStartMonth !== undefined) changes.academicYearStartMonth = Number(data.academicYearStartMonth);

    if (Object.keys(changes).length) {
      await client.update(changes, { transaction });
      await Audit.log(
        ctx,
        'school.settings_updated',
        { entityType: 'client', entityUuid: client.uuid, description: 'Updated school details', before, after: Audit.pick(client, AUDIT_FIELDS) },
        { transaction },
      );
    }
    return SchoolResource.make(client, { today: today(client) });
  });

module.exports = { show, update, usage };
