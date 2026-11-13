const optionSets = require('../../Reports/optionSets');
const { bucketLabels, bucketSql, fillBuckets, kpi } = require('../series');
const { select, round1 } = require('../helpers/areaBShared');

// ANNOUNCEMENTS: notices sent to schools, what is live now and what is coming.
//
// Filters honoured: status (announcement status, worked out from the dates like the Announcements page does:
// Draft stays Draft, an ended window is Expired, a start in the future is Scheduled, otherwise Published/live).
//
// Metric rules:
//  - Published in the period: announcements whose published_at falls in the date range.
//  - Live now: effective status Published (start passed, not ended). Scheduled: waiting for its start date.
//  - Coming in the next 30 days: Scheduled announcements that start within 30 days.
//  - By status / type / audience: announcements CREATED in the date range, with their status as of now.
//  - Average duration: days between start and end for announcements published in the period that have both dates.
//  - Deleted announcements are never counted.

const AUDIENCE_LABELS = { 1: 'All schools', 2: 'Selected schools', 3: 'Selected plans' };
const TYPE_KEYS = [1, 2, 3];
const SOON_DAYS = 30;

const ANNOUNCEMENTS = `(SELECT x.*,
        CASE WHEN x.status = 1 THEN 1
             WHEN x.status = 4 THEN 4
             WHEN x.ends_at IS NOT NULL AND x.ends_at <= :now THEN 4
             WHEN x.starts_at IS NOT NULL AND x.starts_at > :now THEN 2
             ELSE 3 END AS eff
   FROM announcements x WHERE x.deleted_at IS NULL) a`;

const statusSql = (filters) => (filters.status ? ' AND a.eff IN (:statuses)' : '');

module.exports = {
  key: 'announcements.overview',
  area: 'announcements',
  title: 'Announcements',
  description: 'Notices sent to schools: what is live, what is coming and how they are used.',
  filters: ['status'],
  statusKind: 'announcement',
  exportTable: 'liveAndScheduled',

  async run({ range, filters }) {
    const now = new Date();
    const soon = new Date(now.getTime() + SOON_DAYS * 86400000);
    const buckets = bucketLabels(range);
    const base = { now, ...(filters.status ? { statuses: filters.status } : {}) };
    const filterSql = statusSql(filters);

    const publishedBetween = async (from, to) => {
      const [row] = await select(
        `SELECT COUNT(*)::int AS published,
                COALESCE(AVG(EXTRACT(EPOCH FROM (a.ends_at - a.starts_at)) / 86400.0) FILTER (WHERE a.starts_at IS NOT NULL AND a.ends_at IS NOT NULL AND a.ends_at >= a.starts_at), 0)::float AS duration
           FROM ${ANNOUNCEMENTS} WHERE a.published_at >= :from AND a.published_at <= :to${filterSql}`,
        { ...base, from, to },
      );
      return row;
    };

    const current = await publishedBetween(range.fromDate, range.toDate);
    const before = range.previous ? await publishedBetween(range.previous.fromDate, range.previous.toDate) : null;

    const created = `a.created_at >= :from AND a.created_at <= :to${filterSql}`;
    const rangeParams = { ...base, from: range.fromDate, to: range.toDate };

    const [now_, byStatus, byType, byAudience, perBucket, rows] = await Promise.all([
      select(
        `SELECT COUNT(*) FILTER (WHERE a.eff = 3)::int AS live,
                COUNT(*) FILTER (WHERE a.eff = 2 AND a.starts_at <= :soon)::int AS coming,
                COUNT(*) FILTER (WHERE a.eff = 1)::int AS drafts
           FROM ${ANNOUNCEMENTS} WHERE 1 = 1${filterSql}`,
        { ...base, soon },
      ),
      select(`SELECT a.eff AS key, COUNT(*)::int AS value FROM ${ANNOUNCEMENTS} WHERE ${created} GROUP BY a.eff ORDER BY a.eff`, rangeParams),
      select(`SELECT a.type AS key, COUNT(*)::int AS value FROM ${ANNOUNCEMENTS} WHERE ${created} GROUP BY a.type ORDER BY a.type`, rangeParams),
      select(`SELECT a.target_type AS key, COUNT(*)::int AS value FROM ${ANNOUNCEMENTS} WHERE ${created} GROUP BY a.target_type ORDER BY a.target_type`, rangeParams),
      select(
        `SELECT ${bucketSql(range.granularity, 'a.published_at')} AS bucket, a.type AS type, COUNT(*)::int AS value
           FROM ${ANNOUNCEMENTS} WHERE a.published_at >= :from AND a.published_at <= :to${filterSql} GROUP BY 1, a.type`,
        rangeParams,
      ),
      select(
        `SELECT a.title, a.type, a.eff, a.target_type AS "targetType", a.starts_at AS "startsAt", a.ends_at AS "endsAt",
                (SELECT COUNT(*) FROM announcement_targets t WHERE t.announcement_id = a.id)::int AS targets
           FROM ${ANNOUNCEMENTS}
          WHERE (a.eff = 3 OR (a.eff = 2 AND a.starts_at <= :soon))${filterSql}
          ORDER BY a.eff DESC, a.starts_at ASC NULLS FIRST, a.id
          LIMIT 100`,
        { ...base, soon },
      ),
    ]);

    const typeLabels = { 1: 'Info', 2: 'Warning', 3: 'Maintenance' };
    const typeDatasets = TYPE_KEYS.map((type) => ({
      key: `type_${type}`,
      label: optionSets.label('announcementType', type, typeLabels[type]),
      data: fillBuckets(perBucket.filter((row) => Number(row.type) === type), buckets),
    }));
    const publishedSeries = buckets.map((bucket, index) => typeDatasets.reduce((sum, dataset) => sum + dataset.data[index], 0));

    return {
      kpis: [
        kpi({ key: 'published', label: 'Published in period', value: current.published, previous: before ? before.published : undefined, sparkline: publishedSeries }),
        kpi({ key: 'live', label: 'Live now', value: now_[0].live }),
        kpi({ key: 'coming', label: 'Coming in 30 days', value: now_[0].coming }),
        kpi({ key: 'duration', label: 'Average time live', value: round1(current.duration), previous: before ? round1(before.duration) : undefined, unit: 'days' }),
      ],
      series: {
        published: { labels: buckets.map((bucket) => bucket.label), datasets: typeDatasets },
      },
      breakdowns: {
        byStatus: byStatus.map((row) => ({ label: optionSets.label('announcementStatus', row.key), value: row.value })),
        byType: byType.map((row) => ({ label: optionSets.label('announcementType', row.key), value: row.value })),
        byAudience: byAudience.map((row) => ({ label: AUDIENCE_LABELS[row.key] || 'Other', value: row.value })),
      },
      tables: {
        liveAndScheduled: {
          columns: [
            { key: 'title', label: 'Announcement', type: 'text' },
            { key: 'type', label: 'Type', type: 'text' },
            { key: 'status', label: 'Status', type: 'text' },
            { key: 'audience', label: 'Audience', type: 'text' },
            { key: 'startsAt', label: 'Starts', type: 'datetime' },
            { key: 'endsAt', label: 'Ends', type: 'datetime' },
          ],
          rows: rows.map((row) => ({
            title: row.title,
            type: optionSets.label('announcementType', row.type),
            status: optionSets.label('announcementStatus', row.eff),
            audience: Number(row.targetType) === 1 ? AUDIENCE_LABELS[1] : `${AUDIENCE_LABELS[row.targetType] || 'Other'} (${row.targets})`,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
          })),
        },
      },
    };
  },
};
