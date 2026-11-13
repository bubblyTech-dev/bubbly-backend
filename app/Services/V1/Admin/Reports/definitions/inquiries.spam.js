const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const optionSets = require('../optionSets');
const { contains, truncate } = require('../support/common');

// Inquiries that were marked as spam, to see what the public form attracts.
// "Marked" is the last time the inquiry row changed (it is set when the status becomes Spam).
// The visitor's IP address is included on purpose: it is what helps to spot repeat spammers.

module.exports = {
  key: 'inquiries.spam',
  area: 'inquiries',
  title: 'Spam report',
  description: 'Inquiries marked as spam in the period, with the sender and address they came from.',
  usesDateRange: true,

  filters: [
    { key: 'source', label: 'Source', type: 'select', options: 'inquirySource' },
    { key: 'search', label: 'Search', type: 'text' },
  ],

  columns: [
    { key: 'createdAt', label: 'Received', type: 'datetime', width: 18 },
    { key: 'markedAt', label: 'Marked as spam', type: 'datetime', width: 18 },
    { key: 'name', label: 'Name', type: 'text', width: 22 },
    { key: 'email', label: 'Email', type: 'text', width: 28 },
    { key: 'source', label: 'Source', type: 'text', width: 14 },
    { key: 'ipAddress', label: 'IP address', type: 'text', width: 18 },
    { key: 'message', label: 'Message', type: 'text', width: 50 },
  ],

  async run({ range, filters, page, perPage }) {
    const where = ['i.deleted_at IS NULL', 'i.status = 4', 'i.created_at >= :from', 'i.created_at <= :to'];
    const replacements = { from: range.fromDate, to: range.toDate, limit: perPage, offset: (page - 1) * perPage };

    if (filters.source !== undefined) {
      where.push('i.source = :source');
      replacements.source = filters.source;
    }
    if (filters.search) {
      where.push('(i.name ILIKE :q OR i.email ILIKE :q OR i.message ILIKE :q OR i.ip_address ILIKE :q)');
      replacements.q = contains(filters.search);
    }

    const from = `FROM inquiries i WHERE ${where.join(' AND ')}`;
    const [{ total }] = await sequelize.query(`SELECT COUNT(*)::int AS total ${from}`, { replacements, type: QueryTypes.SELECT });

    const rows = await sequelize.query(
      `SELECT i.created_at AS "createdAt", i.updated_at AS "markedAt", i.name, i.email, i.source, i.ip_address AS "ipAddress", i.message
         ${from}
        ORDER BY i.created_at DESC, i.id DESC
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );

    return {
      rows: rows.map((row) => ({
        ...row,
        source: optionSets.label('inquirySource', row.source),
        ipAddress: row.ipAddress || '',
        message: truncate(row.message, 300),
      })),
      total,
    };
  },
};
