const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const { Plan } = require('@app/Models');
const optionSets = require('../optionSets');

// REFERENCE DEFINITION: copy this file to start a new report.
//
// What it lists: every school with its contact, location, GST number, plan and subscription status.
// It ignores the global date range (usesDateRange: false) because a directory is "everything, as of now".
//
// Conventions used here (follow them in your own reports):
//  - run() gets page and perPage; the framework also calls it with page 1 and a large perPage for exports.
//  - Return { rows, total } (and optionally totals); rows carry the column keys, with integer codes already turned into words.
//  - SQL is parameterised: values go in `replacements`. Escape user text used with ILIKE (escapeLike below).
//  - Money columns are in paise; the table and the exports format them as rupees.

const escapeLike = (text) => text.replace(/[\\%_]/g, (match) => `\\${match}`);

module.exports = {
  key: 'schools.directory',
  area: 'schools',
  title: 'School directory',
  description: 'Every school with its contact, location, GST number, plan and subscription status.',
  usesDateRange: false,

  filters: [
    { key: 'status', label: 'School status', type: 'select', options: 'schoolStatus' },
    { key: 'plan', label: 'Plan', type: 'select', options: 'plans' },
    { key: 'search', label: 'Search', type: 'text' },
  ],

  columns: [
    { key: 'name', label: 'School', type: 'text', width: 30 },
    { key: 'status', label: 'Status', type: 'text', width: 12 },
    { key: 'contactName', label: 'Contact person', type: 'text', width: 22 },
    { key: 'contactEmail', label: 'Contact email', type: 'text', width: 28 },
    { key: 'contactPhone', label: 'Phone', type: 'text', width: 16 },
    { key: 'city', label: 'City', type: 'text', width: 16 },
    { key: 'state', label: 'State', type: 'text', width: 16 },
    { key: 'gstNumber', label: 'GST number', type: 'text', width: 20 },
    { key: 'planName', label: 'Plan', type: 'text', width: 18 },
    { key: 'subscriptionStatus', label: 'Subscription', type: 'text', width: 14 },
    { key: 'createdAt', label: 'Joined', type: 'datetime', width: 18 },
  ],

  async run({ filters, page, perPage }) {
    const where = ['c.deleted_at IS NULL'];
    const replacements = { limit: perPage, offset: (page - 1) * perPage };

    if (filters.status !== undefined) {
      where.push('c.status = :status');
      replacements.status = filters.status;
    }
    if (filters.plan) {
      const plan = await Plan.findOne({ where: { uuid: filters.plan }, attributes: ['id'] });
      where.push('latest.plan_id = :planId');
      replacements.planId = plan ? plan.id : 0;
    }
    if (filters.search) {
      where.push('(c.name ILIKE :q OR c.contact_name ILIKE :q OR c.contact_email ILIKE :q OR c.city ILIKE :q OR c.gst_number ILIKE :q)');
      replacements.q = `%${escapeLike(filters.search)}%`;
    }

    // each school's most recent subscription (a school may have several over time)
    const from = `FROM clients c
      LEFT JOIN LATERAL (
        SELECT s.plan_id, s.status
          FROM subscriptions s
         WHERE s.client_id = c.id AND s.deleted_at IS NULL
         ORDER BY s.id DESC
         LIMIT 1
      ) latest ON TRUE
      LEFT JOIN plans p ON p.id = latest.plan_id
      WHERE ${where.join(' AND ')}`;

    const [{ total }] = await sequelize.query(`SELECT COUNT(*)::int AS total ${from}`, { replacements, type: QueryTypes.SELECT });

    const rows = await sequelize.query(
      `SELECT c.name, c.status, c.contact_name AS "contactName", c.contact_email AS "contactEmail", c.contact_phone AS "contactPhone",
              c.city, c.state, c.gst_number AS "gstNumber", p.name AS "planName", latest.status AS "subscriptionStatus", c.created_at AS "createdAt"
         ${from}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );

    return {
      rows: rows.map((row) => ({
        ...row,
        status: optionSets.label('schoolStatus', row.status),
        subscriptionStatus: row.subscriptionStatus ? optionSets.label('subscriptionStatus', row.subscriptionStatus) : '',
      })),
      total,
    };
  },
};
