const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const optionSets = require('../optionSets');
const { EFFECTIVE_STATUS, AUDIENCE } = require('../support/announcements');

// What schools can see now, and what is about to start. It ignores the date range: it is always "as of now".
// "Live now" = published and inside its window; "Scheduled" = published but the start time is still ahead.

module.exports = {
  key: 'announcements.live',
  area: 'announcements',
  title: 'Live and scheduled now',
  description: 'Announcements that are live right now (first) and those scheduled to start, soonest first.',
  usesDateRange: false,

  filters: [{ key: 'type', label: 'Type', type: 'select', options: 'announcementType' }],

  columns: [
    { key: 'title', label: 'Title', type: 'text', width: 36 },
    { key: 'type', label: 'Type', type: 'text', width: 14 },
    { key: 'state', label: 'State', type: 'text', width: 13 },
    { key: 'audience', label: 'Audience', type: 'text', width: 22 },
    { key: 'startsAt', label: 'Starts', type: 'datetime', width: 18 },
    { key: 'endsAt', label: 'Ends', type: 'datetime', width: 18 },
    { key: 'createdBy', label: 'Created by', type: 'text', width: 20 },
  ],

  async run({ filters, page, perPage }) {
    const where = ['a.deleted_at IS NULL', `(${EFFECTIVE_STATUS}) IN (2, 3)`];
    const replacements = { limit: perPage, offset: (page - 1) * perPage };

    if (filters.type !== undefined) {
      where.push('a.type = :type');
      replacements.type = filters.type;
    }

    const from = `FROM announcements a LEFT JOIN admin_users u ON u.id = a.created_by WHERE ${where.join(' AND ')}`;
    const [{ total }] = await sequelize.query(`SELECT COUNT(*)::int AS total ${from}`, { replacements, type: QueryTypes.SELECT });

    const rows = await sequelize.query(
      `SELECT a.title, a.type, ${EFFECTIVE_STATUS} AS status, ${AUDIENCE} AS audience,
              a.starts_at AS "startsAt", a.ends_at AS "endsAt", COALESCE(NULLIF(u.name, ''), u.email) AS "createdBy"
         ${from}
        ORDER BY ${EFFECTIVE_STATUS} DESC, a.starts_at ASC NULLS FIRST, a.id ASC
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );

    return {
      rows: rows.map((row) => ({
        type: optionSets.label('announcementType', row.type),
        title: row.title,
        state: Number(row.status) === 3 ? 'Live now' : 'Scheduled',
        audience: row.audience,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        createdBy: row.createdBy || '',
      })),
      total,
    };
  },
};
