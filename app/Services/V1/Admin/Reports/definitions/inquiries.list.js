const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const optionSets = require('../optionSets');
const { contains, truncate } = require('../support/common');

// Every website inquiry received in the period, with who handles it and how many notes it has.
// The period is the date the inquiry was received (India time). Deleted inquiries are left out.

module.exports = {
  key: 'inquiries.list',
  area: 'inquiries',
  title: 'Inquiry list',
  description: 'Every inquiry received in the period, with its source, status, owner and notes.',
  usesDateRange: true,

  filters: [
    { key: 'status', label: 'Status', type: 'select', options: 'inquiryStatus' },
    { key: 'source', label: 'Source', type: 'select', options: 'inquirySource' },
    { key: 'assignee', label: 'Assigned to (name or email)', type: 'text' },
    { key: 'search', label: 'Search', type: 'text' },
  ],

  columns: [
    { key: 'createdAt', label: 'Received', type: 'datetime', width: 18 },
    { key: 'name', label: 'Name', type: 'text', width: 22 },
    { key: 'email', label: 'Email', type: 'text', width: 28 },
    { key: 'phone', label: 'Phone', type: 'text', width: 16 },
    { key: 'schoolName', label: 'School', type: 'text', width: 24 },
    { key: 'source', label: 'Source', type: 'text', width: 14 },
    { key: 'status', label: 'Status', type: 'text', width: 13 },
    { key: 'assignee', label: 'Assigned to', type: 'text', width: 20 },
    { key: 'notes', label: 'Notes', type: 'integer', width: 8 },
    { key: 'resolvedAt', label: 'Resolved', type: 'datetime', width: 18 },
    { key: 'message', label: 'Message', type: 'text', width: 50 },
  ],

  async run({ range, filters, page, perPage }) {
    const where = ['i.deleted_at IS NULL', 'i.created_at >= :from', 'i.created_at <= :to'];
    const replacements = { from: range.fromDate, to: range.toDate, limit: perPage, offset: (page - 1) * perPage };

    if (filters.status !== undefined) {
      where.push('i.status = :status');
      replacements.status = filters.status;
    }
    if (filters.source !== undefined) {
      where.push('i.source = :source');
      replacements.source = filters.source;
    }
    if (filters.assignee) {
      where.push('(a.name ILIKE :assignee OR a.email ILIKE :assignee)');
      replacements.assignee = contains(filters.assignee);
    }
    if (filters.search) {
      where.push('(i.name ILIKE :q OR i.email ILIKE :q OR i.school_name ILIKE :q OR i.message ILIKE :q)');
      replacements.q = contains(filters.search);
    }

    const from = `FROM inquiries i
      LEFT JOIN admin_users a ON a.id = i.assigned_to
      WHERE ${where.join(' AND ')}`;

    const [{ total }] = await sequelize.query(`SELECT COUNT(*)::int AS total ${from}`, { replacements, type: QueryTypes.SELECT });

    const rows = await sequelize.query(
      `SELECT i.created_at AS "createdAt", i.name, i.email, i.phone, i.school_name AS "schoolName", i.source, i.status,
              COALESCE(a.name, a.email) AS assignee,
              (SELECT COUNT(*)::int FROM inquiry_notes n WHERE n.inquiry_id = i.id) AS notes,
              i.resolved_at AS "resolvedAt", i.message
         ${from}
        ORDER BY i.created_at DESC, i.id DESC
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );

    return {
      rows: rows.map((row) => ({
        ...row,
        source: optionSets.label('inquirySource', row.source),
        status: optionSets.label('inquiryStatus', row.status),
        assignee: row.assignee || '',
        message: truncate(row.message, 500),
      })),
      total,
    };
  },
};
