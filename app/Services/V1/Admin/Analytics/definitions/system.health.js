const optionSets = require('../../Reports/optionSets');
const { bucketLabels, bucketSql, fillBuckets, kpi } = require('../series');
const { select, percentOf } = require('../helpers/areaBShared');

// SYSTEM HEALTH: is the payment webhook working, and what the background job did.
//
// Filters honoured: status (webhook event status). It narrows the numbers about events RECEIVED in the date range.
// "Waiting for attention" and "last event per type" always describe the current situation.
//
// Metric rules:
//  - An event belongs to the day it was received (received_at, else created_at), India time.
//  - Failure rate = Failed events / all events received in the period. 0 when there were none.
//  - Retried = events that needed more than one processing attempt.
//  - Processing time = processed_at minus received_at, in milliseconds, for Processed events.
//  - Needs attention: Failed events, and events still "Received" for more than 10 minutes (stuck).
//  - Offline expiry job: audit entries written by the System on OFFLINE subscriptions (past due, suspended, expired,
//    cancelled). The job is the only System writer that touches offline subscriptions.

const EVENTS = "(SELECT x.*, COALESCE(x.received_at, x.created_at) AS at FROM webhook_events x WHERE x.provider = 'razorpay') w";
const JOB_ACTIONS = { 'subscription.past_due': 'Went past due', 'subscription.suspended': 'Suspended', 'subscription.expired': 'Expired', 'subscription.cancelled': 'Cancelled' };
const STUCK_MINUTES = 10;

const statusSql = (filters) => (filters.status ? ' AND w.status IN (:statuses)' : '');
const statusParams = (filters) => (filters.status ? { statuses: filters.status } : {});

const totals = async (from, to, filters) => {
  const [row] = await select(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE w.status = 3)::int AS failed,
            COUNT(*) FILTER (WHERE w.attempts > 1)::int AS retried,
            COALESCE(AVG(EXTRACT(EPOCH FROM (w.processed_at - w.received_at)) * 1000) FILTER (WHERE w.status = 2 AND w.processed_at IS NOT NULL AND w.received_at IS NOT NULL AND w.processed_at >= w.received_at), 0)::float AS "avgMs"
       FROM ${EVENTS} WHERE w.at >= :from AND w.at <= :to${statusSql(filters)}`,
    { from, to, ...statusParams(filters) },
  );
  return row;
};

module.exports = {
  key: 'system.health',
  area: 'system-health',
  title: 'System health',
  description: 'Whether payment notifications arrive and are processed, and what the background job did.',
  filters: ['status'],
  statusKind: 'webhook',
  exportTable: 'attention',

  async run({ range, filters }) {
    const now = new Date();
    const buckets = bucketLabels(range);
    const labels = buckets.map((bucket) => bucket.label);
    const params = { from: range.fromDate, to: range.toDate, ...statusParams(filters) };
    const inRange = `w.at >= :from AND w.at <= :to${statusSql(filters)}`;

    const current = await totals(range.fromDate, range.toDate, filters);
    const before = range.previous ? await totals(range.previous.fromDate, range.previous.toDate, filters) : null;

    const [perBucket, avgPerBucket, byType, attempts, lastPerType, attention, waiting, jobPerBucket, jobByAction] = await Promise.all([
      select(
        `SELECT ${bucketSql(range.granularity, 'w.at')} AS bucket,
                COUNT(*) FILTER (WHERE w.status = 2)::int AS processed, COUNT(*) FILTER (WHERE w.status = 3)::int AS failed,
                COUNT(*) FILTER (WHERE w.status = 4)::int AS ignored, COUNT(*) FILTER (WHERE w.status = 1)::int AS received
           FROM ${EVENTS} WHERE ${inRange} GROUP BY 1`,
        params,
      ),
      select(
        `SELECT ${bucketSql(range.granularity, 'w.at')} AS bucket,
                COALESCE(AVG(EXTRACT(EPOCH FROM (w.processed_at - w.received_at)) * 1000) FILTER (WHERE w.status = 2 AND w.processed_at IS NOT NULL AND w.received_at IS NOT NULL AND w.processed_at >= w.received_at), 0)::float AS value
           FROM ${EVENTS} WHERE ${inRange} GROUP BY 1`,
        params,
      ),
      select(`SELECT w.event_type AS label, COUNT(*)::int AS value FROM ${EVENTS} WHERE ${inRange} GROUP BY w.event_type ORDER BY value DESC, label LIMIT 8`, params),
      select(
        `SELECT COUNT(*) FILTER (WHERE GREATEST(w.attempts, 1) = 1)::int AS one,
                COUNT(*) FILTER (WHERE w.attempts = 2)::int AS two,
                COUNT(*) FILTER (WHERE w.attempts = 3)::int AS three,
                COUNT(*) FILTER (WHERE w.attempts >= 4)::int AS four
           FROM ${EVENTS} WHERE ${inRange}`,
        params,
      ),
      select(
        `SELECT w.event_type AS "eventType", MAX(w.at) AS "lastReceived",
                COUNT(*) FILTER (WHERE w.at >= :from AND w.at <= :to)::int AS "inPeriod",
                COUNT(*) FILTER (WHERE w.status = 3 AND w.at >= :from AND w.at <= :to)::int AS "failedInPeriod"
           FROM ${EVENTS} GROUP BY w.event_type ORDER BY "lastReceived" DESC LIMIT 30`,
        { from: range.fromDate, to: range.toDate },
      ),
      select(
        `SELECT w.event_id AS "eventId", w.event_type AS "eventType", w.status, w.attempts, w.at AS "receivedAt", w.error_message AS "errorMessage"
           FROM ${EVENTS}
          WHERE w.status = 3 OR (w.status = 1 AND w.at < :stuckBefore)
          ORDER BY w.at DESC LIMIT 100`,
        { stuckBefore: new Date(now.getTime() - STUCK_MINUTES * 60000) },
      ),
      select(`SELECT COUNT(*)::int AS value FROM ${EVENTS} WHERE w.status = 3 OR (w.status = 1 AND w.at < :stuckBefore)`, { stuckBefore: new Date(now.getTime() - STUCK_MINUTES * 60000) }),
      select(
        `SELECT ${bucketSql(range.granularity, 'a.created_at')} AS bucket, a.action AS action, COUNT(*)::int AS value
           FROM audit_logs a JOIN subscriptions s ON s.uuid = a.entity_uuid
          WHERE a.entity_type = 'subscription' AND a.actor_type = 3 AND s.source = 2 AND a.action IN (:actions)
            AND a.created_at >= :from AND a.created_at <= :to
          GROUP BY 1, a.action`,
        { from: range.fromDate, to: range.toDate, actions: Object.keys(JOB_ACTIONS) },
      ),
      select(
        `SELECT a.action AS action, COUNT(*)::int AS value
           FROM audit_logs a JOIN subscriptions s ON s.uuid = a.entity_uuid
          WHERE a.entity_type = 'subscription' AND a.actor_type = 3 AND s.source = 2 AND a.action IN (:actions)
            AND a.created_at >= :from AND a.created_at <= :to
          GROUP BY a.action ORDER BY value DESC`,
        { from: range.fromDate, to: range.toDate, actions: Object.keys(JOB_ACTIONS) },
      ),
    ]);

    const totalPerBucket = buckets.map((bucket) => {
      const row = perBucket.find((item) => String(item.bucket) === bucket.key);
      return row ? row.processed + row.failed + row.ignored + row.received : 0;
    });
    const jobDatasets = Object.entries(JOB_ACTIONS)
      .map(([action, label]) => ({ key: action, label, data: fillBuckets(jobByBucket(jobPerBucket, action), buckets) }))
      .filter((dataset) => dataset.data.some((value) => value > 0));
    const att = attempts[0];

    return {
      kpis: [
        kpi({ key: 'events', label: 'Notifications received', value: current.total, previous: before ? before.total : undefined, sparkline: totalPerBucket }),
        kpi({ key: 'failureRate', label: 'Failure rate', value: percentOf(current.failed, current.total), previous: before ? percentOf(before.failed, before.total) : undefined, unit: 'percent' }),
        kpi({ key: 'waiting', label: 'Waiting for attention', value: waiting[0].value }),
        kpi({ key: 'processing', label: 'Average processing (ms)', value: Math.round(current.avgMs), previous: before ? Math.round(before.avgMs) : undefined }),
        kpi({ key: 'retried', label: 'Needed a retry', value: current.retried, previous: before ? before.retried : undefined }),
        kpi({ key: 'jobMoves', label: 'Offline schools moved by the job', value: jobByAction.reduce((sum, row) => sum + row.value, 0) }),
      ],
      series: {
        events: {
          labels,
          datasets: [
            { key: 'processed', label: 'Processed', data: fillBuckets(perBucket, buckets, 'processed') },
            { key: 'ignored', label: 'Ignored', data: fillBuckets(perBucket, buckets, 'ignored') },
            { key: 'failed', label: 'Failed', data: fillBuckets(perBucket, buckets, 'failed') },
            { key: 'received', label: 'Still received', data: fillBuckets(perBucket, buckets, 'received') },
          ],
        },
        processing: { labels, datasets: [{ key: 'ms', label: 'Average processing (ms)', data: fillBuckets(avgPerBucket, buckets).map((value) => Math.round(value)) }] },
        attempts: {
          labels: ['1 attempt', '2 attempts', '3 attempts', '4 or more'],
          datasets: [{ key: 'events', label: 'Events', data: [att.one, att.two, att.three, att.four] }],
        },
        expiryJob: { labels, datasets: jobDatasets.length ? jobDatasets : [{ key: 'none', label: 'No changes', data: buckets.map(() => 0) }] },
      },
      breakdowns: {
        byType: byType,
        jobByAction: jobByAction.map((row) => ({ label: JOB_ACTIONS[row.action], value: row.value })),
        byStatus: [
          { label: optionSets.label('webhookStatus', 2), value: perBucket.reduce((sum, row) => sum + row.processed, 0) },
          { label: optionSets.label('webhookStatus', 3), value: perBucket.reduce((sum, row) => sum + row.failed, 0) },
          { label: optionSets.label('webhookStatus', 4), value: perBucket.reduce((sum, row) => sum + row.ignored, 0) },
          { label: optionSets.label('webhookStatus', 1), value: perBucket.reduce((sum, row) => sum + row.received, 0) },
        ].filter((item) => item.value > 0),
      },
      tables: {
        lastPerType: {
          columns: [
            { key: 'eventType', label: 'Notification type', type: 'text' },
            { key: 'lastReceived', label: 'Last received', type: 'datetime' },
            { key: 'inPeriod', label: 'In period', type: 'integer' },
            { key: 'failedInPeriod', label: 'Failed in period', type: 'integer' },
          ],
          rows: lastPerType,
        },
        attention: {
          columns: [
            { key: 'receivedAt', label: 'Received', type: 'datetime' },
            { key: 'eventType', label: 'Type', type: 'text' },
            { key: 'status', label: 'Status', type: 'text' },
            { key: 'errorMessage', label: 'What went wrong', type: 'text' },
            { key: 'eventId', label: 'Event id', type: 'text' },
          ],
          rows: attention.map((row) => ({ ...row, status: optionSets.label('webhookStatus', row.status), errorMessage: row.errorMessage || '-' })),
        },
      },
    };
  },
};

// the job rows of one action as [{ bucket, value }]
function jobByBucket(rows, action) {
  return rows.filter((row) => row.action === action);
}
