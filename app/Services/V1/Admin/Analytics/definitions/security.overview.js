const optionSets = require('../../Reports/optionSets');
const { bucketLabels, bucketSql, fillBuckets, kpi } = require('../series');
const { select, maskEmail } = require('../helpers/areaBShared');

// STAFF & SECURITY: who signs in, who fails to, what staff change and the sensitive things they do.
//
// Filters honoured: status (the status of the staff account). It narrows the staff account numbers only
// (locked now, active sessions, staff by type and by status). Login history and the audit log are not narrowed by it.
//
// Metric rules:
//  - Logins and failed logins come from admin_login_history in the date range (India time).
//  - Failed-login hotspots: the top 10 pairs of (email tried, address) by failures. Emails are masked (ra***@e***.com).
//  - Locked now: accounts with status Locked, or a lock that has not expired yet.
//  - Active sessions now: signed-in devices (not logged out, not expired) of accounts that are not deleted.
//  - Audit numbers come from audit_logs. Rows made by the MASTER admin are hidden unless the viewer is the master admin
//    (the same rule as the Audit Log page), so a staff member never sees them here either.
//  - Sensitive actions: refunds, permission, status and password changes, deletions, settings changes and Principal
//    password resets (list below).

const SENSITIVE_ACTIONS = [
  'payment.refunded',
  'admin_user.permissions_changed',
  'admin_user.status_changed',
  'admin_user.password_reset',
  'admin_user.deleted',
  'admin_user.sessions_revoked',
  'school.status_changed',
  'school.deleted',
  'school.principal_password_reset',
  'setting.updated',
  'subscription.cancelled',
];

const AREA_LABELS = {
  admin_user: 'Staff and access',
  school: 'Schools',
  plan: 'Plans',
  module: 'Modules',
  subscription: 'Subscriptions',
  payment: 'Payments',
  invoice: 'Invoices',
  inquiry: 'Inquiries',
  announcement: 'Announcements',
  setting: 'Settings',
  report: 'Reports',
};

const FAILURE_LABELS = { 1: 'Wrong password', 2: 'Unknown email', 3: 'Account inactive', 4: 'Account locked' };

const humanAction = (action) => {
  const text = String(action || '').replace(/_/g, ' ').replace('.', ' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const MAX_ACTIONS = 6;

module.exports = {
  key: 'security.overview',
  area: 'staff-security',
  title: 'Staff and security',
  description: 'Sign-ins, failed attempts, locked accounts, active sessions and what staff change.',
  filters: ['status'],
  statusKind: 'admin',
  exportTable: 'sensitive',

  async run({ range, filters, ctx }) {
    const now = new Date();
    const buckets = bucketLabels(range);
    const labels = buckets.map((bucket) => bucket.label);
    const isMaster = Boolean(ctx && ctx.admin && ctx.admin.isMaster);
    const hide = isMaster ? '' : ' AND (a.actor_is_master = 0 OR a.actor_is_master IS NULL)';
    const accountStatus = filters.status ? ' AND u.status IN (:statuses)' : '';
    const accountParams = filters.status ? { statuses: filters.status } : {};
    const rangeParams = { from: range.fromDate, to: range.toDate };

    const loginTotals = (from, to) =>
      select(
        `SELECT COUNT(*) FILTER (WHERE h.result = 1)::int AS success, COUNT(*) FILTER (WHERE h.result = 2)::int AS failed
           FROM admin_login_history h WHERE h.created_at >= :from AND h.created_at <= :to`,
        { from, to },
      );
    const auditTotals = (from, to) =>
      select(
        `SELECT COUNT(*)::int AS events, COUNT(*) FILTER (WHERE a.action IN (:sensitive))::int AS sensitive
           FROM audit_logs a WHERE a.created_at >= :from AND a.created_at <= :to${hide}`,
        { from, to, sensitive: SENSITIVE_ACTIONS },
      );

    const [
      current,
      previous,
      auditNow,
      auditBefore,
      loginSeries,
      reasons,
      hotspots,
      lockedNow,
      sessionsNow,
      staffByType,
      staffByStatus,
      auditPerBucket,
      auditByArea,
      actionRows,
      actorRows,
      sensitivePerBucket,
      sensitiveRows,
    ] = await Promise.all([
      loginTotals(range.fromDate, range.toDate),
      range.previous ? loginTotals(range.previous.fromDate, range.previous.toDate) : Promise.resolve(null),
      auditTotals(range.fromDate, range.toDate),
      range.previous ? auditTotals(range.previous.fromDate, range.previous.toDate) : Promise.resolve(null),
      select(
        `SELECT ${bucketSql(range.granularity, 'h.created_at')} AS bucket,
                COUNT(*) FILTER (WHERE h.result = 1)::int AS success, COUNT(*) FILTER (WHERE h.result = 2)::int AS failed
           FROM admin_login_history h WHERE h.created_at >= :from AND h.created_at <= :to GROUP BY 1`,
        rangeParams,
      ),
      select(
        `SELECT h.failure_reason AS key, COUNT(*)::int AS value FROM admin_login_history h
          WHERE h.result = 2 AND h.created_at >= :from AND h.created_at <= :to GROUP BY h.failure_reason ORDER BY value DESC`,
        rangeParams,
      ),
      select(
        `SELECT h.email_tried AS email, h.ip_address AS ip, COUNT(*)::int AS failures, MAX(h.created_at) AS "lastAttempt",
                MODE() WITHIN GROUP (ORDER BY h.failure_reason) AS reason
           FROM admin_login_history h
          WHERE h.result = 2 AND h.created_at >= :from AND h.created_at <= :to
          GROUP BY h.email_tried, h.ip_address
          ORDER BY failures DESC, "lastAttempt" DESC
          LIMIT 10`,
        rangeParams,
      ),
      select(
        `SELECT COUNT(*)::int AS value FROM admin_users u
          WHERE u.deleted_at IS NULL AND (u.status = 3 OR (u.locked_until IS NOT NULL AND u.locked_until > :now))${accountStatus}`,
        { now, ...accountParams },
      ),
      select(
        `SELECT COUNT(*)::int AS value FROM admin_sessions s JOIN admin_users u ON u.id = s.admin_user_id
          WHERE u.deleted_at IS NULL AND s.revoked_at IS NULL AND s.expires_at > :now${accountStatus}`,
        { now, ...accountParams },
      ),
      select(`SELECT u.type AS key, COUNT(*)::int AS value FROM admin_users u WHERE u.deleted_at IS NULL${accountStatus} GROUP BY u.type ORDER BY u.type`, accountParams),
      select(`SELECT u.status AS key, COUNT(*)::int AS value FROM admin_users u WHERE u.deleted_at IS NULL${accountStatus} GROUP BY u.status ORDER BY u.status`, accountParams),
      select(`SELECT ${bucketSql(range.granularity, 'a.created_at')} AS bucket, COUNT(*)::int AS value FROM audit_logs a WHERE a.created_at >= :from AND a.created_at <= :to${hide} GROUP BY 1`, rangeParams),
      select(
        `SELECT COALESCE(a.entity_type, 'other') AS key, COUNT(*)::int AS value FROM audit_logs a
          WHERE a.created_at >= :from AND a.created_at <= :to${hide} GROUP BY 1 ORDER BY value DESC LIMIT 12`,
        rangeParams,
      ),
      select(
        `SELECT ${bucketSql(range.granularity, 'a.created_at')} AS bucket, a.action AS action, COUNT(*)::int AS value
           FROM audit_logs a WHERE a.created_at >= :from AND a.created_at <= :to${hide} GROUP BY 1, a.action`,
        rangeParams,
      ),
      select(
        `SELECT a.actor_name AS actor, COUNT(*)::int AS events,
                COUNT(*) FILTER (WHERE a.action IN (:sensitive))::int AS sensitive, MAX(a.created_at) AS "lastEvent"
           FROM audit_logs a WHERE a.created_at >= :from AND a.created_at <= :to${hide}
          GROUP BY a.actor_type, a.actor_id, a.actor_name
          ORDER BY events DESC, actor
          LIMIT 10`,
        { ...rangeParams, sensitive: SENSITIVE_ACTIONS },
      ),
      select(
        `SELECT ${bucketSql(range.granularity, 'a.created_at')} AS bucket, COUNT(*)::int AS value FROM audit_logs a
          WHERE a.created_at >= :from AND a.created_at <= :to AND a.action IN (:sensitive)${hide} GROUP BY 1`,
        { ...rangeParams, sensitive: SENSITIVE_ACTIONS },
      ),
      select(
        `SELECT a.created_at AS "createdAt", a.actor_name AS actor, a.action, a.description
           FROM audit_logs a WHERE a.created_at >= :from AND a.created_at <= :to AND a.action IN (:sensitive)${hide}
          ORDER BY a.created_at DESC, a.id DESC LIMIT 200`,
        { ...rangeParams, sensitive: SENSITIVE_ACTIONS },
      ),
    ]);

    // the busiest actions over time (the rest together)
    const actionTotals = new Map();
    for (const row of actionRows) actionTotals.set(row.action, (actionTotals.get(row.action) || 0) + row.value);
    const topActions = [...actionTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_ACTIONS).map((entry) => entry[0]);
    const actionDatasets = topActions.map((action) => ({
      key: action,
      label: humanAction(action),
      data: fillBuckets(actionRows.filter((row) => row.action === action), buckets),
    }));
    if (actionTotals.size > topActions.length) {
      const rest = new Map();
      for (const row of actionRows.filter((item) => !topActions.includes(item.action))) rest.set(row.bucket, (rest.get(row.bucket) || 0) + row.value);
      actionDatasets.push({ key: 'others', label: 'Other actions', data: fillBuckets([...rest.entries()].map(([bucket, value]) => ({ bucket, value })), buckets) });
    }

    const successPerBucket = fillBuckets(loginSeries, buckets, 'success');
    const failedPerBucket = fillBuckets(loginSeries, buckets, 'failed');
    const sensitiveSeries = fillBuckets(sensitivePerBucket, buckets);
    const auditSeries = fillBuckets(auditPerBucket, buckets);

    return {
      kpis: [
        kpi({ key: 'logins', label: 'Successful sign-ins', value: current[0].success, previous: previous ? previous[0].success : undefined, sparkline: successPerBucket }),
        kpi({ key: 'failedLogins', label: 'Failed sign-ins', value: current[0].failed, previous: previous ? previous[0].failed : undefined, sparkline: failedPerBucket }),
        kpi({ key: 'locked', label: 'Locked accounts now', value: lockedNow[0].value }),
        kpi({ key: 'sessions', label: 'Active sessions now', value: sessionsNow[0].value }),
        kpi({ key: 'auditEvents', label: 'Audit events', value: auditNow[0].events, previous: auditBefore ? auditBefore[0].events : undefined, sparkline: auditSeries }),
        kpi({ key: 'sensitive', label: 'Sensitive actions', value: auditNow[0].sensitive, previous: auditBefore ? auditBefore[0].sensitive : undefined, sparkline: sensitiveSeries }),
      ],
      series: {
        logins: {
          labels,
          datasets: [
            { key: 'success', label: 'Successful', data: successPerBucket },
            { key: 'failed', label: 'Failed', data: failedPerBucket },
          ],
        },
        auditByAction: { labels, datasets: actionDatasets },
        sensitive: { labels, datasets: [{ key: 'sensitive', label: 'Sensitive actions', data: sensitiveSeries }] },
      },
      breakdowns: {
        failureReasons: reasons.map((row) => ({ label: FAILURE_LABELS[row.key] || 'Other', value: row.value })),
        auditByArea: auditByArea.map((row) => ({ label: AREA_LABELS[row.key] || 'Other', value: row.value })),
        staffByType: staffByType.map((row) => ({ label: optionSets.label('adminType', row.key), value: row.value })),
        staffByStatus: staffByStatus.map((row) => ({ label: optionSets.label('adminStatus', row.key), value: row.value })),
      },
      tables: {
        hotspots: {
          columns: [
            { key: 'email', label: 'Email tried (masked)', type: 'text' },
            { key: 'ip', label: 'Address', type: 'text' },
            { key: 'failures', label: 'Failed attempts', type: 'integer' },
            { key: 'reason', label: 'Usual reason', type: 'text' },
            { key: 'lastAttempt', label: 'Last attempt', type: 'datetime' },
          ],
          rows: hotspots.map((row) => ({ ...row, email: maskEmail(row.email), reason: FAILURE_LABELS[row.reason] || '-' })),
        },
        actors: {
          columns: [
            { key: 'actor', label: 'Who', type: 'text' },
            { key: 'events', label: 'Actions', type: 'integer' },
            { key: 'sensitive', label: 'Sensitive', type: 'integer' },
            { key: 'lastEvent', label: 'Last action', type: 'datetime' },
          ],
          rows: actorRows,
        },
        sensitive: {
          columns: [
            { key: 'createdAt', label: 'When', type: 'datetime' },
            { key: 'actor', label: 'Who', type: 'text' },
            { key: 'action', label: 'What', type: 'text' },
            { key: 'description', label: 'Details', type: 'text' },
          ],
          rows: sensitiveRows.map((row) => ({ ...row, action: humanAction(row.action) })),
        },
      },
    };
  },
};
