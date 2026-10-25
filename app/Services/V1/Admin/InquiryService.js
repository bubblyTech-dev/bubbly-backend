const { Op } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const { isUuid, findOrFail } = require('@app/Helpers/ref');
const { Inquiry, InquiryNote, AdminUser } = require('@app/Models');
const { INQUIRY_STATUS, ADMIN_STATUS } = require('@app/Helpers/constants');
const InquiryResource = require('@app/Resources/V1/Admin/InquiryResource');
const InquiryNoteResource = require('@app/Resources/V1/Admin/InquiryNoteResource');

const STATUS_LABELS = {
  [INQUIRY_STATUS.NEW]: 'New',
  [INQUIRY_STATUS.IN_PROGRESS]: 'In progress',
  [INQUIRY_STATUS.RESOLVED]: 'Resolved',
  [INQUIRY_STATUS.SPAM]: 'Spam',
};

const assigneeInclude = { model: AdminUser, as: 'assignee', attributes: ['uuid', 'name', 'email'] };

// % and _ typed by the user must not act as wildcards
const escapeLike = (value) => String(value).replace(/[\\%_]/g, (character) => `\\${character}`);

const find = (uuid) => findOrFail(Inquiry, uuid, { include: [assigneeInclude] });

const reload = (inquiry) => find(inquiry.uuid).then((fresh) => InquiryResource.make(fresh));

const list = async (admin, query) => {
  const page = Number(query.page) || 1;
  const perPage = Number(query.perPage) || 15;
  const where = {};

  if (query.status) where.status = Number(query.status);
  if (query.source) where.source = Number(query.source);

  if (query.search) {
    const like = { [Op.iLike]: `%${escapeLike(query.search)}%` };
    where[Op.or] = [{ name: like }, { email: like }, { schoolName: like }, { message: like }];
  }

  if (query.assignedTo === 'me') {
    where.assignedTo = admin.id;
  } else if (query.assignedTo) {
    const staff = isUuid(query.assignedTo) ? await AdminUser.findOne({ where: { uuid: query.assignedTo }, attributes: ['id'] }) : null;
    where.assignedTo = staff ? staff.id : -1; // an unknown person has no inquiries
  }

  const { rows, count } = await Inquiry.findAndCountAll({
    where,
    include: [assigneeInclude],
    order: [['createdAt', 'DESC']],
    limit: perPage,
    offset: (page - 1) * perPage,
  });

  return InquiryResource.paginate({ rows, count, page, perPage });
};

const show = async (uuid) => InquiryResource.make(await find(uuid));

// totals for the sidebar badge and the filter chips
const counts = async () => {
  const rows = await Inquiry.count({ group: ['status'] });
  const byStatus = { new: 0, inProgress: 0, resolved: 0, spam: 0 };

  for (const row of rows) {
    const key = { [INQUIRY_STATUS.NEW]: 'new', [INQUIRY_STATUS.IN_PROGRESS]: 'inProgress', [INQUIRY_STATUS.RESOLVED]: 'resolved', [INQUIRY_STATUS.SPAM]: 'spam' }[Number(row.status)];
    if (key) byStatus[key] = Number(row.count);
  }

  return { ...byStatus, total: Object.values(byStatus).reduce((sum, value) => sum + value, 0) };
};

// active staff the inquiry can be given to
const assignees = async () => {
  const admins = await AdminUser.findAll({
    where: { status: ADMIN_STATUS.ACTIVE },
    attributes: ['uuid', 'name', 'email'],
    order: [['name', 'ASC']],
  });

  return admins.map((admin) => ({ uuid: admin.uuid, name: admin.name, email: admin.email }));
};

const updateStatus = async (ctx, uuid, { status }) => {
  const inquiry = await find(uuid);
  const next = Number(status);
  const previous = Number(inquiry.status);

  await sequelize.transaction(async (transaction) => {
    await inquiry.update(
      { status: next, resolvedAt: next === INQUIRY_STATUS.RESOLVED ? new Date() : null },
      { transaction },
    );

    await Audit.log(
      ctx,
      'inquiry.status_changed',
      {
        entityType: 'inquiry',
        entityUuid: inquiry.uuid,
        description: `Inquiry from ${inquiry.name} changed from ${STATUS_LABELS[previous]} to ${STATUS_LABELS[next]}`,
        before: { status: previous },
        after: { status: next },
      },
      { transaction },
    );
  });

  return reload(inquiry);
};

const assign = async (ctx, uuid, data) => {
  if (data.assignedTo === undefined) {
    throw AppError.validation({ assignedTo: ['Choose a staff member, or send null to remove the assignment.'] });
  }

  const inquiry = await find(uuid);
  const previous = inquiry.assignee ? inquiry.assignee.uuid : null;

  let staff = null;
  if (data.assignedTo) {
    staff = await AdminUser.findOne({ where: { uuid: data.assignedTo, status: ADMIN_STATUS.ACTIVE } });
    if (!staff) throw AppError.validation({ assignedTo: ['This staff member is not available.'] });
  }

  await sequelize.transaction(async (transaction) => {
    await inquiry.update({ assignedTo: staff ? staff.id : null }, { transaction });

    await Audit.log(
      ctx,
      'inquiry.assigned',
      {
        entityType: 'inquiry',
        entityUuid: inquiry.uuid,
        description: staff ? `Inquiry from ${inquiry.name} assigned to ${staff.name || staff.email}` : `Inquiry from ${inquiry.name} unassigned`,
        before: { assignedTo: previous },
        after: { assignedTo: staff ? staff.uuid : null },
      },
      { transaction },
    );
  });

  return reload(inquiry);
};

const listNotes = async (uuid) => {
  const inquiry = await findOrFail(Inquiry, uuid, { attributes: ['id'] });
  const notes = await InquiryNote.findAll({
    where: { inquiryId: inquiry.id },
    include: [{ model: AdminUser, as: 'author', attributes: ['uuid', 'name'] }],
    order: [['createdAt', 'DESC']],
  });

  return InquiryNoteResource.collection(notes);
};

const addNote = async (ctx, uuid, { note }) => {
  const inquiry = await findOrFail(Inquiry, uuid);
  let created;

  await sequelize.transaction(async (transaction) => {
    created = await InquiryNote.create({ inquiryId: inquiry.id, note, createdBy: ctx.admin.id }, { transaction });

    await Audit.log(
      ctx,
      'inquiry.note_added',
      {
        entityType: 'inquiry',
        entityUuid: inquiry.uuid,
        description: `Note added to the inquiry from ${inquiry.name}`,
      },
      { transaction },
    );
  });

  const withAuthor = await InquiryNote.findByPk(created.id, {
    include: [{ model: AdminUser, as: 'author', attributes: ['uuid', 'name'] }],
  });

  return InquiryNoteResource.make(withAuthor);
};

// only inquiries that are finished (Resolved or Spam) can be removed
const remove = async (ctx, uuid) => {
  const inquiry = await find(uuid);
  const status = Number(inquiry.status);

  if (status !== INQUIRY_STATUS.RESOLVED && status !== INQUIRY_STATUS.SPAM) {
    throw AppError.validation({ status: ['Only resolved or spam inquiries can be deleted.'] });
  }

  await sequelize.transaction(async (transaction) => {
    await inquiry.destroy({ transaction });

    await Audit.log(
      ctx,
      'inquiry.deleted',
      {
        entityType: 'inquiry',
        entityUuid: inquiry.uuid,
        description: `Inquiry from ${inquiry.name} deleted`,
        before: { status },
      },
      { transaction },
    );
  });
};

module.exports = { list, show, counts, assignees, updateStatus, assign, listNotes, addNote, remove };
