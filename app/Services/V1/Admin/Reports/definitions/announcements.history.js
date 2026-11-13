const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const optionSets = require('../optionSets');
const { contains } = require('../support/common');
const { EFFECTIVE_STATUS, AUDIENCE } = require('../support/announcements');

// Every announcement created in the period. The status is the one it has right now, including Expired once its end
// time has passed. Deleted announcements are left out.

module.exports = {
  key: 'announcements.history',
  area: 'announcements',
  title: 'Announcement history',
  description: 'Every announcement created in the period, with its type, audience, schedule and current status.',
  usesDateRange: true,

  filters: [
    { key: 'type', label: 'Type', type: 'select', options: 'announcementType' },
    { key: 'status', label: 'Status now', type: 'select', options: 'announcementStatus' },
    { key: 'search', label: 'Title', type: 'text' },
  ],

  columns: [
    { key: 'title', label: 'Title', type: 'text', width: 36 },
    { key: 'type', label: 'Type', type: 'text', width: 14 },
    { key: 'status', label: 'Status now', type: 'text', width: 13 },
    { key: 'audience', label: 'Audience', type: 'text', width: 22 },
    { key: 'startsAt', label: 'Starts', type: 'datetime', width: 18 },
    { key: 'endsAt', label: 'Ends', type: 'datetime', width: 18 },
    { key: 'publishedAt', label: 'Published', type: 'datetime', width: 18 },
    { key: 'createdBy', label: 'Created by', type: 'text', width: 20 },
    { key: 'createdAt', label: 'Created', type: 'datetime', width: 18 },
  ],

  async run({ range, filters, page, perPage }) {
    const where = ['a.deleted_at IS NULL', 'a.created_at >= :from', 'a.created_at <= :to'];
    const replacements = { from: range.fromDate, to: range.toDate, limit: perPage, offset: (page - 1) * perPage };

    if (filters.type !== undefined) {
      where.push('a.type = :type');
      replacements.type = filters.type;
    }
    if (filters.status !== undefined) {
      where.push(`(${EFFECTIVE_STATUS}) = :status`);
      replacements.status = filters.status;
    }
    if (filters.search) {
      where.push('a.title ILIKE :q');
      replacements.q = contains(filters.search);
    }

    const from = `FROM announcements a LEFT JOIN admin_users u ON u.id = a.created_by WHERE ${where.join(' AND ')}`;
    const [{ total }] = await sequelize.query(`SELECT COUNT(*)::int AS total ${from}`, { replacements, type: QueryTypes.SELECT });

    const rows = await sequelize.query(
      `SELECT a.title, a.type, ${EFFECTIVE_STATUS} AS status, ${AUDIENCE} AS audience,
              a.starts_at AS "startsAt", a.ends_at AS "endsAt", a.published_at AS "publishedAt",
              COALESCE(NULLIF(u.name, ''), u.email) AS "createdBy", a.created_at AS "createdAt"
         ${from}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );

    return {
      rows: rows.map((row) => ({
        ...row,
        type: optionSets.label('announcementType', row.type),
        status: optionSets.label('announcementStatus', row.status),
        createdBy: row.createdBy || '',
      })),
      total,
    };
  },
};
