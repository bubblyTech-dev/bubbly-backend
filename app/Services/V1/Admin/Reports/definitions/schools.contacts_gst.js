const { like, paged } = require('../lib/sql');
const optionSets = require('../optionSets');

// Contact details and GST numbers of every school, for follow-ups and for invoicing checks.
module.exports = {
  key: 'schools.contacts_gst',
  area: 'schools',
  title: 'Contacts & GST',
  description: 'Contact person, address and GST number of every school.',
  usesDateRange: false,

  filters: [
    { key: 'status', label: 'School status', type: 'select', options: 'schoolStatus' },
    {
      key: 'gst',
      label: 'GST number',
      type: 'select',
      options: [
        { value: 'with', label: 'Has a GST number' },
        { value: 'without', label: 'No GST number' },
      ],
    },
    { key: 'search', label: 'Search', type: 'text' },
  ],

  columns: [
    { key: 'name', label: 'School', type: 'text', width: 30 },
    { key: 'status', label: 'Status', type: 'text', width: 12 },
    { key: 'contactName', label: 'Contact person', type: 'text', width: 22 },
    { key: 'contactEmail', label: 'Email', type: 'text', width: 28 },
    { key: 'contactPhone', label: 'Phone', type: 'text', width: 16 },
    { key: 'address', label: 'Address', type: 'text', width: 36 },
    { key: 'city', label: 'City', type: 'text', width: 16 },
    { key: 'state', label: 'State', type: 'text', width: 16 },
    { key: 'postalCode', label: 'Postal code', type: 'text', width: 12 },
    { key: 'gstNumber', label: 'GST number', type: 'text', width: 20 },
    { key: 'hasGst', label: 'GST on file', type: 'text', width: 12 },
  ],

  async run({ filters, page, perPage }) {
    const where = ['c.deleted_at IS NULL'];
    const replacements = {};

    if (filters.status !== undefined) {
      where.push('c.status = :status');
      replacements.status = filters.status;
    }
    if (filters.gst === 'with') where.push("COALESCE(c.gst_number, '') <> ''");
    if (filters.gst === 'without') where.push("COALESCE(c.gst_number, '') = ''");
    if (filters.search) {
      where.push('(c.name ILIKE :q OR c.contact_name ILIKE :q OR c.contact_email ILIKE :q OR c.city ILIKE :q OR c.gst_number ILIKE :q)');
      replacements.q = like(filters.search);
    }

    const sql = `SELECT c.name, c.status, c.contact_name AS "contactName", c.contact_email AS "contactEmail", c.contact_phone AS "contactPhone",
                        NULLIF(CONCAT_WS(', ', NULLIF(c.address_line1, ''), NULLIF(c.address_line2, '')), '') AS address,
                        c.city, c.state, c.postal_code AS "postalCode", c.gst_number AS "gstNumber",
                        (COALESCE(c.gst_number, '') <> '') AS "hasGst"
                   FROM clients c
                  WHERE ${where.join(' AND ')}
                  ORDER BY c.name ASC, c.id ASC`;

    const result = await paged({ sql, replacements, page, perPage });

    return {
      rows: result.rows.map((row) => ({
        ...row,
        status: optionSets.label('schoolStatus', row.status),
        hasGst: row.hasGst ? 'Yes' : 'No',
      })),
      total: result.total,
    };
  },
};
