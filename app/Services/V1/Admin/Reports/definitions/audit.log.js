const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const { contains, startsWith, compactJson } = require('../support/common');
const { visibleToViewer, ENTITY_LABELS, ACTOR_LABELS } = require('../support/audit');

// The full audit log for a period: who did what, when, from where, on which record, with the values before and after.
// Rule kept from the Audit Log page: what the MASTER admin did is visible to the master admin only.
// "Before" and "After" are the compact JSON the app saved (the audit code never stores passwords or tokens);
// each is cut to 4,000 characters so a single row stays small.

module.exports = {
  key: 'audit.log',
  area: 'audit',
  title: 'Audit log export',
  description: 'Every recorded action in the period: who, what, on which record, from which address, with before and after values.',
  usesDateRange: true,

  filters: [
    {
      key: 'entityType',
      label: 'Area',
      type: 'select',
      options: Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label })),
    },
    { key: 'action', label: 'Action starts with', type: 'text' },
    { key: 'actor', label: 'Done by (name)', type: 'text' },
    { key: 'search', label: 'Search description', type: 'text' },
  ],

  columns: [
    { key: 'createdAt', label: 'When', type: 'datetime', width: 18 },
    { key: 'actorName', label: 'Done by', type: 'text', width: 22 },
    { key: 'actorType', label: 'Actor type', type: 'text', width: 12 },
    { key: 'action', label: 'Action', type: 'text', width: 30 },
    { key: 'entityType', label: 'Area', type: 'text', width: 16 },
    { key: 'entityUuid', label: 'Record id', type: 'text', width: 38 },
    { key: 'school', label: 'School', type: 'text', width: 24 },
    { key: 'description', label: 'Description', type: 'text', width: 60 },
    { key: 'ipAddress', label: 'IP address', type: 'text', width: 18 },
    { key: 'before', label: 'Before', type: 'text', width: 40 },
    { key: 'after', label: 'After', type: 'text', width: 40 },
  ],

  async run({ range, filters, page, perPage, ctx }) {
    const where = ['l.created_at >= :from', 'l.created_at <= :to'];
    const replacements = { from: range.fromDate, to: range.toDate, limit: perPage, offset: (page - 1) * perPage };

    const hidden = visibleToViewer(ctx);
    if (hidden) where.push(hidden);

    if (filters.entityType) {
      where.push('l.entity_type = :entityType');
      replacements.entityType = filters.entityType;
    }
    if (filters.action) {
      where.push('l.action ILIKE :action');
      replacements.action = startsWith(filters.action);
    }
    if (filters.actor) {
      where.push('l.actor_name ILIKE :actor');
      replacements.actor = contains(filters.actor);
    }
    if (filters.search) {
      where.push('l.description ILIKE :q');
      replacements.q = contains(filters.search);
    }

    const from = `FROM audit_logs l LEFT JOIN clients c ON c.id = l.client_id WHERE ${where.join(' AND ')}`;
    const [{ total }] = await sequelize.query(`SELECT COUNT(*)::int AS total ${from}`, { replacements, type: QueryTypes.SELECT });

    const rows = await sequelize.query(
      `SELECT l.created_at AS "createdAt", l.actor_name AS "actorName", l.actor_type AS "actorType", l.action,
              l.entity_type AS "entityType", l.entity_uuid AS "entityUuid", c.name AS school, l.description,
              l.ip_address AS "ipAddress", l.before_data AS "before", l.after_data AS "after"
         ${from}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );

    return {
      rows: rows.map((row) => ({
        ...row,
        actorName: row.actorName || '',
        actorType: ACTOR_LABELS[row.actorType] || '-',
        entityType: ENTITY_LABELS[row.entityType] || row.entityType || '',
        entityUuid: row.entityUuid || '',
        school: row.school || '',
        description: row.description || '',
        ipAddress: row.ipAddress || '',
        before: compactJson(row.before),
        after: compactJson(row.after),
      })),
      total,
    };
  },
};
