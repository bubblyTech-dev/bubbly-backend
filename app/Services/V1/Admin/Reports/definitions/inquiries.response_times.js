const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const optionSets = require('../optionSets');
const { contains, hours } = require('../support/common');

// How quickly inquiries are handled.
//
// How it is worked out (shown to the reader in the description too):
//   - First response  = the moment the FIRST internal note was added to the inquiry. An inquiry with no note has no
//                       first response yet (the cell is empty and it is counted as "still waiting").
//   - Resolution time = from the moment it was received until it was marked Resolved (resolved_at).
// Hours are real elapsed hours (24 per day). Spam is left out. The slowest first responses come first.
// The averages in the last row cover EVERY matching inquiry, not only the page on screen.

const BASE_WHERE = 'i.deleted_at IS NULL AND i.status <> 4 AND i.created_at >= :from AND i.created_at <= :to';

module.exports = {
  key: 'inquiries.response_times',
  area: 'inquiries',
  title: 'Response times',
  description: 'Time to first response (first internal note) and time to resolution, slowest first. Spam is not counted.',
  usesDateRange: true,

  filters: [
    { key: 'status', label: 'Status', type: 'select', options: 'inquiryStatus' },
    { key: 'source', label: 'Source', type: 'select', options: 'inquirySource' },
    { key: 'assignee', label: 'Assigned to (name or email)', type: 'text' },
  ],

  columns: [
    { key: 'createdAt', label: 'Received', type: 'datetime', width: 18 },
    { key: 'name', label: 'Name', type: 'text', width: 22 },
    { key: 'schoolName', label: 'School', type: 'text', width: 24 },
    { key: 'source', label: 'Source', type: 'text', width: 14 },
    { key: 'status', label: 'Status', type: 'text', width: 13 },
    { key: 'assignee', label: 'Assigned to', type: 'text', width: 20 },
    { key: 'firstResponseAt', label: 'First response', type: 'datetime', width: 18 },
    { key: 'firstResponseHours', label: 'Hours to first response', type: 'number', width: 14 },
    { key: 'resolvedAt', label: 'Resolved', type: 'datetime', width: 18 },
    { key: 'resolutionHours', label: 'Hours to resolve', type: 'number', width: 14 },
  ],

  async run({ range, filters, page, perPage }) {
    const where = [BASE_WHERE];
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

    const from = `FROM inquiries i
      LEFT JOIN admin_users a ON a.id = i.assigned_to
      LEFT JOIN LATERAL (
        SELECT n.created_at FROM inquiry_notes n WHERE n.inquiry_id = i.id ORDER BY n.created_at ASC, n.id ASC LIMIT 1
      ) first_note ON TRUE
      WHERE ${where.join(' AND ')}`;

    const [summary] = await sequelize.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(first_note.created_at)::int AS answered,
              AVG(EXTRACT(EPOCH FROM (first_note.created_at - i.created_at)) / 3600) AS "avgFirst",
              AVG(EXTRACT(EPOCH FROM (i.resolved_at - i.created_at)) / 3600) FILTER (WHERE i.resolved_at IS NOT NULL) AS "avgResolve"
         ${from}`,
      { replacements, type: QueryTypes.SELECT },
    );

    const rows = await sequelize.query(
      `SELECT i.created_at AS "createdAt", i.name, i.school_name AS "schoolName", i.source, i.status,
              COALESCE(NULLIF(a.name, ''), a.email) AS assignee,
              first_note.created_at AS "firstResponseAt",
              EXTRACT(EPOCH FROM (first_note.created_at - i.created_at)) / 3600 AS "firstResponseHours",
              i.resolved_at AS "resolvedAt",
              EXTRACT(EPOCH FROM (i.resolved_at - i.created_at)) / 3600 AS "resolutionHours"
         ${from}
        ORDER BY "firstResponseHours" DESC NULLS LAST, i.created_at DESC, i.id DESC
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );

    return {
      rows: rows.map((row) => ({
        ...row,
        source: optionSets.label('inquirySource', row.source),
        status: optionSets.label('inquiryStatus', row.status),
        assignee: row.assignee || '',
        firstResponseHours: hours(row.firstResponseHours),
        resolutionHours: hours(row.resolutionHours),
      })),
      total: summary.total,
      totals: {
        name: `Average (${summary.answered} of ${summary.total} answered)`,
        firstResponseHours: hours(summary.avgFirst),
        resolutionHours: hours(summary.avgResolve),
      },
    };
  },
};
