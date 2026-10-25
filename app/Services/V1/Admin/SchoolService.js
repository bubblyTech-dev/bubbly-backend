const { Op } = require('sequelize');
const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const Files = require('@app/Helpers/files');
const { paginationParams } = require('@app/Helpers/pagination');
const { findOrFail } = require('@app/Helpers/ref');
const { sequelize } = require('@app/Helpers/database');
const { CLIENT_STATUS } = require('@app/Helpers/constants');
const { Client, ClientNote, ClientStatusHistory, AdminUser } = require('@app/Models');
const SchoolResource = require('@app/Resources/V1/Admin/SchoolResource');
const SchoolNoteResource = require('@app/Resources/V1/Admin/SchoolNoteResource');
const SchoolStatusHistoryResource = require('@app/Resources/V1/Admin/SchoolStatusHistoryResource');

// Schools (clients) as managed by Bubbly staff. Every change runs in a transaction together with its audit entry.
// `ctx` is { admin, ip, userAgent }: the logged-in admin and where the request came from.

const LOGO_TYPE = 'clientLogo';
const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const DEFAULT_COUNTRY = 'India';
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

// fields an admin may set directly
const EDITABLE = [
  'name',
  'contactName',
  'contactEmail',
  'contactPhone',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'country',
  'gstNumber',
  'timezone',
];

// what a status can change into
const TRANSITIONS = {
  [CLIENT_STATUS.ACTIVE]: [CLIENT_STATUS.SUSPENDED, CLIENT_STATUS.ARCHIVED],
  [CLIENT_STATUS.SUSPENDED]: [CLIENT_STATUS.ACTIVE, CLIENT_STATUS.ARCHIVED],
  [CLIENT_STATUS.ARCHIVED]: [CLIENT_STATUS.ACTIVE],
};

const STATUS_LABEL = {
  [CLIENT_STATUS.ACTIVE]: 'Active',
  [CLIENT_STATUS.SUSPENDED]: 'Suspended',
  [CLIENT_STATUS.ARCHIVED]: 'Archived',
};

const isTrue = (value) => [true, 1, '1', 'true'].includes(value);

// what is written to the audit log: only these fields, never anything else
const snapshot = (school) => ({
  name: school.name,
  slug: school.slug,
  status: Number(school.status),
  contactName: school.contactName,
  contactEmail: school.contactEmail,
  contactPhone: school.contactPhone,
  addressLine1: school.addressLine1,
  addressLine2: school.addressLine2,
  city: school.city,
  state: school.state,
  postalCode: school.postalCode,
  country: school.country,
  gstNumber: school.gstNumber,
  logo: school.logo,
  timezone: school.timezone,
});

const escapeLike = (text) => text.replace(/[\\%_]/g, '\\$&');

const slugify = (name) => {
  const slug = String(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || 'school';
};

// a slug nobody else uses (deleted schools count too, so an old address is never reused)
const uniqueSlug = async (name, transaction) => {
  const base = slugify(name);
  let slug = base;
  let counter = 2;

  while (await Client.findOne({ where: { slug }, paranoid: false, attributes: ['id'], transaction })) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  return slug;
};

// trims, lowercases the email, upper-cases and checks the GST number
const cleanValues = (data) => {
  const values = {};

  for (const field of EDITABLE) {
    if (data[field] !== undefined) values[field] = data[field];
  }
  if (typeof values.contactEmail === 'string') values.contactEmail = values.contactEmail.toLowerCase();

  if (typeof values.gstNumber === 'string') {
    values.gstNumber = values.gstNumber.toUpperCase().replace(/\s+/g, '');
    if (!GSTIN_PATTERN.test(values.gstNumber)) {
      throw AppError.validation({ gstNumber: ['The GST number is not valid. It has 15 characters, for example 22AAAAA0000A1Z5.'] });
    }
  }
  return values;
};

const list = async (query) => {
  const { page, perPage, limit, offset } = paginationParams(query);
  const where = {};

  if (query.status) where.status = Number(query.status);

  if (query.search) {
    const pattern = `%${escapeLike(query.search)}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: pattern } },
      { slug: { [Op.iLike]: pattern } },
      { contactName: { [Op.iLike]: pattern } },
      { contactEmail: { [Op.iLike]: pattern } },
      { contactPhone: { [Op.iLike]: pattern } },
    ];
  }

  const { rows, count } = await Client.findAndCountAll({ where, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit, offset });
  return SchoolResource.paginate({ rows, count, page, perPage });
};

const show = async (uuid) => SchoolResource.make(await findOrFail(Client, uuid));

const create = async (data, ctx) => {
  const values = cleanValues(data);
  values.country = values.country || DEFAULT_COUNTRY;
  values.timezone = values.timezone || DEFAULT_TIMEZONE;

  // the logo moves from temp into its real folder first; it is removed again if the database change fails
  let logo = null;
  if (data.logo) logo = await Files.commit(LOGO_TYPE, data.logo, { owner: Files.ownerOf(ctx.admin), field: 'logo' });

  try {
    const school = await sequelize.transaction(async (transaction) => {
      const created = await Client.create(
        {
          ...values,
          slug: await uniqueSlug(values.name, transaction),
          status: CLIENT_STATUS.ACTIVE,
          logo,
          createdBy: ctx.admin.id,
          updatedBy: ctx.admin.id,
        },
        { transaction },
      );

      await Audit.log(
        ctx,
        'school.created',
        {
          entityType: 'school',
          entityUuid: created.uuid,
          clientId: created.id,
          description: `Added school ${created.name}`,
          after: snapshot(created),
        },
        { transaction },
      );
      return created;
    });

    return SchoolResource.make(school);
  } catch (err) {
    if (logo) await Files.remove(LOGO_TYPE, logo);
    throw err;
  }
};

const update = async (uuid, data, ctx) => {
  const school = await findOrFail(Client, uuid);
  const before = snapshot(school);
  const changes = cleanValues(data);

  const previous = school.logo;
  let committed = null;

  if (data.logo && data.logo !== previous) {
    committed = await Files.commit(LOGO_TYPE, data.logo, { owner: Files.ownerOf(ctx.admin), field: 'logo' });
    changes.logo = committed;
  } else if (isTrue(data.removeLogo)) {
    changes.logo = null;
  }

  changes.updatedBy = ctx.admin.id;

  try {
    await sequelize.transaction(async (transaction) => {
      await school.update(changes, { transaction });

      await Audit.log(
        ctx,
        'school.updated',
        {
          entityType: 'school',
          entityUuid: school.uuid,
          clientId: school.id,
          description: `Updated school ${school.name}`,
          before,
          after: snapshot(school),
        },
        { transaction },
      );
    });
  } catch (err) {
    if (committed) await Files.remove(LOGO_TYPE, committed); // do not leave an unused file behind
    throw err;
  }

  // the old logo goes only after the database change succeeded
  if (previous && changes.logo !== undefined && changes.logo !== previous) await Files.remove(LOGO_TYPE, previous);

  return SchoolResource.make(school);
};

const changeStatus = async (uuid, { status, reason }, ctx) => {
  const school = await findOrFail(Client, uuid);
  const from = Number(school.status);
  const to = Number(status);

  if (from === to) {
    throw AppError.validation({ status: [`The school is already ${STATUS_LABEL[from].toLowerCase()}.`] });
  }
  if (!(TRANSITIONS[from] || []).includes(to)) {
    throw AppError.validation({ status: [`A ${STATUS_LABEL[from].toLowerCase()} school cannot be changed to ${STATUS_LABEL[to].toLowerCase()}.`] });
  }

  await sequelize.transaction(async (transaction) => {
    await school.update({ status: to, updatedBy: ctx.admin.id }, { transaction });

    await ClientStatusHistory.create(
      { clientId: school.id, fromStatus: from, toStatus: to, reason, changedBy: ctx.admin.id },
      { transaction },
    );

    await Audit.log(
      ctx,
      'school.status_changed',
      {
        entityType: 'school',
        entityUuid: school.uuid,
        clientId: school.id,
        description: `Changed ${school.name} from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]}: ${reason}`,
        before: { status: from },
        after: { status: to, reason },
      },
      { transaction },
    );
  });

  return SchoolResource.make(school);
};

const statusHistory = async (uuid, query) => {
  const school = await findOrFail(Client, uuid);
  const { page, perPage, limit, offset } = paginationParams(query);

  const { rows, count } = await ClientStatusHistory.findAndCountAll({
    where: { clientId: school.id },
    include: [{ model: AdminUser, as: 'changer', attributes: ['uuid', 'name'] }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });
  return SchoolStatusHistoryResource.paginate({ rows, count, page, perPage });
};

const notes = async (uuid, query) => {
  const school = await findOrFail(Client, uuid);
  const { page, perPage, limit, offset } = paginationParams(query);

  const { rows, count } = await ClientNote.findAndCountAll({
    where: { clientId: school.id },
    include: [{ model: AdminUser, as: 'creator', attributes: ['uuid', 'name'] }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });
  return SchoolNoteResource.paginate({ rows, count, page, perPage });
};

const addNote = async (uuid, { note }, ctx) => {
  const school = await findOrFail(Client, uuid);

  const created = await sequelize.transaction(async (transaction) => {
    const row = await ClientNote.create({ clientId: school.id, note, createdBy: ctx.admin.id }, { transaction });

    await Audit.log(
      ctx,
      'school.note_added',
      {
        entityType: 'school',
        entityUuid: school.uuid,
        clientId: school.id,
        description: `Added a note on ${school.name}`,
      },
      { transaction },
    );
    return row;
  });

  const withCreator = await ClientNote.findByPk(created.id, {
    include: [{ model: AdminUser, as: 'creator', attributes: ['uuid', 'name'] }],
  });
  return SchoolNoteResource.make(withCreator);
};

// Only an archived school can be deleted. It is a soft delete, so the data can still be recovered by the team.
const remove = async (uuid, ctx) => {
  const school = await findOrFail(Client, uuid);

  if (Number(school.status) !== CLIENT_STATUS.ARCHIVED) {
    throw AppError.validation({ status: ['Archive the school before deleting it.'] });
  }

  await sequelize.transaction(async (transaction) => {
    await Audit.log(
      ctx,
      'school.deleted',
      {
        entityType: 'school',
        entityUuid: school.uuid,
        clientId: school.id,
        description: `Deleted school ${school.name}`,
        before: snapshot(school),
      },
      { transaction },
    );
    await school.destroy({ transaction });
  });
};

// The real numbers arrive with the school-data modules (students, teachers, classes, files).
// Until those tables exist every counter is zero.
const usage = async (uuid) => {
  await findOrFail(Client, uuid);
  return { students: 0, teachers: 0, classes: 0, storageMb: 0 };
};

module.exports = { list, show, create, update, changeStatus, statusHistory, notes, addNote, remove, usage };
