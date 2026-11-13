const { like, paged } = require('../lib/sql');
const optionSets = require('../optionSets');

// Every suspend, reactivate and archive, with the reason and who did it (from the school status history).
module.exports = {
  key: 'schools.status_changes',
  area: 'schools',
  title: 'Status changes',
  description: 'Every time a school was suspended, reactivated or archived, with the reason and who did it.',
  usesDateRange: true,

  filters: [
    { key: 'status', label: 'Changed to', type: 'select', options: 'schoolStatus' },
    { key: 'search', label: 'Search school or reason', type: 'text' },
  ],

  columns: [
    { key: 'changedAt', label: 'When', type: 'datetime', width: 18 },
    { key: 'school', label: 'School', type: 'text', width: 30 },
    { key: 'fromStatus', label: 'From', type: 'text', width: 12 },
    { key: 'toStatus', label: 'To', type: 'text', width: 12 },
    { key: 'reason', label: 'Reason', type: 'text', width: 44 },
    { key: 'changedBy', label: 'Changed by', type: 'text', width: 22 },
  ],

  async run({ range, filters, page, perPage }) {
    const where = ['h.created_at >= :from', 'h.created_at <= :to'];
    const replacements = { from: range.fromDate, to: range.toDate };

    if (filters.status !== undefined) {
      where.push('h.to_status = :status');
      replacements.status = filters.status;
    }
    if (filters.search) {
      where.push('(c.name ILIKE :q OR h.reason ILIKE :q)');
      replacements.q = like(filters.search);
    }

    const sql = `SELECT h.created_at AS "changedAt", c.name AS school, h.from_status AS "fromStatus", h.to_status AS "toStatus",
                        COALESCE(h.reason, '') AS reason, COALESCE(a.name, a.email, '') AS "changedBy"
                   FROM client_status_history h
                   JOIN clients c ON c.id = h.client_id
                   LEFT JOIN admin_users a ON a.id = h.changed_by
                  WHERE ${where.join(' AND ')}
                  ORDER BY h.created_at DESC, h.id DESC`;

    const result = await paged({ sql, replacements, page, perPage });

    return {
      rows: result.rows.map((row) => ({
        ...row,
        fromStatus: row.fromStatus ? optionSets.label('schoolStatus', row.fromStatus) : '',
        toStatus: optionSets.label('schoolStatus', row.toStatus),
      })),
      total: result.total,
    };
  },
};
