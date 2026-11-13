const optionSets = require('../../Reports/optionSets');
const { bucketLabels, bucketSql, fillBuckets, kpi } = require('../series');
const { select, percentOf } = require('../helpers/areaBShared');

// INQUIRIES: messages from the website forms, how fast they are answered and how many became schools.
//
// Filters honoured: source (contact form, demo request, pricing page) and status (inquiry status).
//  - Numbers about the period (volume, sources, statuses, response times, funnel) use inquiries RECEIVED in the date
//    range, narrowed by the source and status filters.
//  - "Open now", the staff workload and the oldest-open table always show what is open today (the date range and the
//    status filter do not apply to them; the source filter does).
//
// Metric rules:
//  - First response (estimate): time from receiving the inquiry to the earliest of its first internal note and its
//    resolved time. Inquiries with neither are left out of the average.
//  - Resolution time: received to resolved_at, for inquiries with status Resolved.
//  - Handled: an inquiry that has a note or is In progress or Resolved. Resolved: status Resolved.
//  - Converted to a school (approximate): a school was added later with the same contact email (compared in lower case).
//  - Spam is counted in the volume but never counted as handled by the funnel unless a staff member noted it.

const sourceSql = (filters) => (filters.source ? ' AND i.source IN (:sources)' : '');
const statusSql = (filters) => (filters.status ? ' AND i.status IN (:statuses)' : '');

const replacementsFor = (filters) => ({
  ...(filters.source ? { sources: filters.source } : {}),
  ...(filters.status ? { statuses: filters.status } : {}),
});

const periodNumbers = async ({ from, to, filters }) => {
  const where = `i.deleted_at IS NULL AND i.created_at >= :from AND i.created_at <= :to${sourceSql(filters)}${statusSql(filters)}`;
  const params = { from, to, ...replacementsFor(filters) };

  const [funnel, response] = await Promise.all([
    select(
      `SELECT COUNT(*)::int AS received,
              COUNT(*) FILTER (WHERE i.status IN (2, 3) OR EXISTS (SELECT 1 FROM inquiry_notes n WHERE n.inquiry_id = i.id))::int AS handled,
              COUNT(*) FILTER (WHERE i.status = 3)::int AS resolved,
              COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM clients c WHERE c.deleted_at IS NULL AND lower(c.contact_email) = lower(i.email) AND c.created_at >= i.created_at))::int AS converted
         FROM inquiries i WHERE ${where}`,
      params,
    ),
    select(
      `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (x.first_response - x.created_at)) / 86400.0) FILTER (WHERE x.first_response IS NOT NULL AND x.first_response >= x.created_at), 0)::float AS "firstResponse",
              COALESCE(AVG(EXTRACT(EPOCH FROM (x.resolved_at - x.created_at)) / 86400.0) FILTER (WHERE x.status = 3 AND x.resolved_at IS NOT NULL AND x.resolved_at >= x.created_at), 0)::float AS resolution
         FROM (SELECT i.created_at, i.status, i.resolved_at,
                      LEAST((SELECT MIN(n.created_at) FROM inquiry_notes n WHERE n.inquiry_id = i.id), i.resolved_at) AS first_response
                 FROM inquiries i WHERE ${where}) x`,
      params,
    ),
  ]);

  return { ...funnel[0], firstResponse: response[0].firstResponse, resolution: response[0].resolution };
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

module.exports = {
  key: 'inquiries.overview',
  area: 'inquiries',
  title: 'Inquiries',
  description: 'How many inquiries arrive, how fast they are answered, who is working on them and how many became schools.',
  filters: ['source', 'status'],
  statusKind: 'inquiry',
  sourceKind: 'inquiry',
  exportTable: 'oldestOpen',

  async run({ range, filters }) {
    const buckets = bucketLabels(range);
    const labels = buckets.map((bucket) => bucket.label);
    const params = { from: range.fromDate, to: range.toDate, ...replacementsFor(filters) };
    const inRange = `i.deleted_at IS NULL AND i.created_at >= :from AND i.created_at <= :to${sourceSql(filters)}${statusSql(filters)}`;
    const openParams = { ...(filters.source ? { sources: filters.source } : {}) };

    const current = await periodNumbers({ from: range.fromDate, to: range.toDate, filters });
    const before = range.previous ? await periodNumbers({ from: range.previous.fromDate, to: range.previous.toDate, filters }) : null;

    const [perBucket, bySource, byStatus, openNow, workload, oldestOpen] = await Promise.all([
      select(`SELECT ${bucketSql(range.granularity, 'i.created_at')} AS bucket, COUNT(*)::int AS value FROM inquiries i WHERE ${inRange} GROUP BY 1`, params),
      select(`SELECT i.source AS key, COUNT(*)::int AS value FROM inquiries i WHERE ${inRange} GROUP BY i.source ORDER BY i.source`, params),
      select(`SELECT i.status AS key, COUNT(*)::int AS value FROM inquiries i WHERE ${inRange} GROUP BY i.status ORDER BY i.status`, params),
      select(
        `SELECT COUNT(*)::int AS open, COUNT(*) FILTER (WHERE i.assigned_to IS NULL)::int AS unassigned
           FROM inquiries i WHERE i.deleted_at IS NULL AND i.status IN (1, 2)${sourceSql(filters)}`,
        openParams,
      ),
      select(
        `SELECT COALESCE(NULLIF(a.name, ''), a.email, 'Unassigned') AS staff,
                COUNT(*) FILTER (WHERE i.created_at >= :from AND i.created_at <= :to)::int AS assigned,
                COUNT(*) FILTER (WHERE i.status IN (1, 2))::int AS "openNow",
                COUNT(*) FILTER (WHERE i.status = 3 AND i.resolved_at >= :from AND i.resolved_at <= :to)::int AS resolved,
                COALESCE(AVG(EXTRACT(EPOCH FROM (i.resolved_at - i.created_at)) / 86400.0) FILTER (WHERE i.status = 3 AND i.resolved_at >= :from AND i.resolved_at <= :to AND i.resolved_at >= i.created_at), 0)::float AS "avgResolution"
           FROM inquiries i LEFT JOIN admin_users a ON a.id = i.assigned_to
          WHERE i.deleted_at IS NULL${sourceSql(filters)}
            AND (i.status IN (1, 2) OR (i.created_at >= :from AND i.created_at <= :to) OR (i.resolved_at >= :from AND i.resolved_at <= :to))
          GROUP BY a.id, a.name, a.email
          ORDER BY "openNow" DESC, assigned DESC, staff
          LIMIT 50`,
        { from: range.fromDate, to: range.toDate, ...(filters.source ? { sources: filters.source } : {}) },
      ),
      select(
        `SELECT i.name, i.school_name AS "schoolName", i.source, i.status, i.created_at AS "receivedAt",
                COALESCE(NULLIF(a.name, ''), a.email) AS assignee,
                EXTRACT(DAY FROM (:now::timestamptz - i.created_at))::int AS "ageDays"
           FROM inquiries i LEFT JOIN admin_users a ON a.id = i.assigned_to
          WHERE i.deleted_at IS NULL AND i.status IN (1, 2)${sourceSql(filters)}
          ORDER BY (i.assigned_to IS NULL) DESC, i.created_at ASC
          LIMIT 100`,
        { now: new Date(), ...(filters.source ? { sources: filters.source } : {}) },
      ),
    ]);

    const volume = fillBuckets(perBucket, buckets);
    const staffRows = workload.slice(0, 10);

    return {
      kpis: [
        kpi({ key: 'received', label: 'Inquiries received', value: current.received, previous: before ? before.received : undefined, sparkline: volume }),
        kpi({ key: 'openNow', label: 'Open now', value: openNow[0].open }),
        kpi({ key: 'unassigned', label: 'Waiting for someone', value: openNow[0].unassigned }),
        kpi({ key: 'conversion', label: 'Became a school', value: percentOf(current.converted, current.received), previous: before ? percentOf(before.converted, before.received) : undefined, unit: 'percent' }),
        kpi({ key: 'firstResponse', label: 'Average first response', value: round2(current.firstResponse), previous: before ? round2(before.firstResponse) : undefined, unit: 'days' }),
        kpi({ key: 'resolution', label: 'Average time to resolve', value: round2(current.resolution), previous: before ? round2(before.resolution) : undefined, unit: 'days' }),
      ],
      series: {
        volume: { labels, datasets: [{ key: 'received', label: 'Inquiries received', data: volume }] },
        funnel: {
          labels: ['Received', 'Handled', 'Resolved', 'Became a school'],
          datasets: [{ key: 'inquiries', label: 'Inquiries', data: [current.received, current.handled, current.resolved, current.converted] }],
        },
        workload: {
          labels: staffRows.map((row) => row.staff),
          datasets: [
            { key: 'openNow', label: 'Open now', data: staffRows.map((row) => row.openNow) },
            { key: 'resolved', label: 'Resolved in period', data: staffRows.map((row) => row.resolved) },
          ],
        },
      },
      breakdowns: {
        bySource: bySource.map((row) => ({ label: optionSets.label('inquirySource', row.key), value: row.value })),
        byStatus: byStatus.map((row) => ({ label: optionSets.label('inquiryStatus', row.key), value: row.value })),
      },
      tables: {
        assignees: {
          columns: [
            { key: 'staff', label: 'Staff member', type: 'text' },
            { key: 'assigned', label: 'Received in period', type: 'integer' },
            { key: 'openNow', label: 'Open now', type: 'integer' },
            { key: 'resolved', label: 'Resolved in period', type: 'integer' },
            { key: 'avgResolution', label: 'Avg days to resolve', type: 'number' },
          ],
          rows: workload.map((row) => ({ ...row, avgResolution: round2(row.avgResolution) })),
        },
        oldestOpen: {
          columns: [
            { key: 'name', label: 'Name', type: 'text' },
            { key: 'schoolName', label: 'School', type: 'text' },
            { key: 'source', label: 'Source', type: 'text' },
            { key: 'assignee', label: 'Assigned to', type: 'text' },
            { key: 'receivedAt', label: 'Received', type: 'datetime' },
            { key: 'ageDays', label: 'Days waiting', type: 'integer' },
          ],
          rows: oldestOpen.map((row) => ({
            ...row,
            source: optionSets.label('inquirySource', row.source),
            assignee: row.assignee || 'Nobody yet',
          })),
        },
      },
    };
  },
};
