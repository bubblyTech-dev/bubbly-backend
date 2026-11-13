const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const optionSets = require('../optionSets');
const { percentOf } = require('../support/common');

// Inquiries counted by source, by status or by assigned staff member (choose with "Group by").
// Each row shows the total, the count in every status, its share of all inquiries and how many were resolved.

const GROUPS = {
  source: { label: 'Source', expression: 'i.source::text', name: (key) => optionSets.label('inquirySource', Number(key)) },
  status: { label: 'Status', expression: 'i.status::text', name: (key) => optionSets.label('inquiryStatus', Number(key)) },
  assignee: { label: 'Assigned to', expression: "COALESCE(NULLIF(a.name, ''), a.email, 'Unassigned')", name: (key) => key },
};

module.exports = {
  key: 'inquiries.grouped',
  area: 'inquiries',
  title: 'Inquiries by source, status or owner',
  description: 'How many inquiries came from each source, sit in each status or belong to each staff member.',
  usesDateRange: true,

  filters: [
    {
      key: 'groupBy',
      label: 'Group by',
      type: 'select',
      options: Object.entries(GROUPS).map(([value, group]) => ({ value, label: group.label })),
    },
  ],

  columns: [
    { key: 'group', label: 'Group', type: 'text', width: 26 },
    { key: 'total', label: 'Inquiries', type: 'integer', width: 12 },
    { key: 'newCount', label: 'New', type: 'integer', width: 10 },
    { key: 'inProgress', label: 'In progress', type: 'integer', width: 12 },
    { key: 'resolved', label: 'Resolved', type: 'integer', width: 12 },
    { key: 'spam', label: 'Spam', type: 'integer', width: 10 },
    { key: 'share', label: 'Share of all', type: 'percent', width: 12 },
    { key: 'resolvedRate', label: 'Resolved rate', type: 'percent', width: 14 },
  ],

  async run({ range, filters, page, perPage }) {
    const mode = GROUPS[filters.groupBy] ? filters.groupBy : 'source';
    const group = GROUPS[mode];

    const found = await sequelize.query(
      `SELECT ${group.expression} AS grp,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE i.status = 1)::int AS "newCount",
              COUNT(*) FILTER (WHERE i.status = 2)::int AS "inProgress",
              COUNT(*) FILTER (WHERE i.status = 3)::int AS resolved,
              COUNT(*) FILTER (WHERE i.status = 4)::int AS spam
         FROM inquiries i
         LEFT JOIN admin_users a ON a.id = i.assigned_to
        WHERE i.deleted_at IS NULL AND i.created_at >= :from AND i.created_at <= :to
        GROUP BY 1
        ORDER BY total DESC, grp ASC`,
      { replacements: { from: range.fromDate, to: range.toDate }, type: QueryTypes.SELECT },
    );

    const sum = (key) => found.reduce((all, row) => all + row[key], 0);
    const everything = sum('total');

    const all = found.map((row) => ({
      group: group.name(row.grp),
      total: row.total,
      newCount: row.newCount,
      inProgress: row.inProgress,
      resolved: row.resolved,
      spam: row.spam,
      share: percentOf(row.total, everything),
      resolvedRate: percentOf(row.resolved, row.total),
    }));

    return {
      rows: all.slice((page - 1) * perPage, page * perPage),
      total: all.length,
      totals: {
        group: 'Total',
        total: everything,
        newCount: sum('newCount'),
        inProgress: sum('inProgress'),
        resolved: sum('resolved'),
        spam: sum('spam'),
        share: everything > 0 ? 100 : 0,
        resolvedRate: percentOf(sum('resolved'), everything),
      },
    };
  },
};
