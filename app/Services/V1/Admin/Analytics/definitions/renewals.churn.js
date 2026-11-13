const Settings = require('@app/Helpers/settings');
const optionSets = require('../../Reports/optionSets');
const { bucketLabels, bucketSql, fillBuckets, kpi } = require('../series');
const { select, gstRate, exGstSql, percentOf, round1, nextDays, dailyRange, daysUntil } = require('../helpers/areaBShared');

// RENEWALS & CHURN: what is about to renew, how renewals went, who left and who came back.
//
// Filters honoured: plan (the subscription's plan) and source (1 Online / 2 Offline subscription).
//
// Metric rules (all dates are India time; money is in paise WITHOUT GST):
//  - Due in the next 30 days: Active subscriptions that will charge again, i.e. next charge date (or period end when no
//    charge is planned) falls in the next 30 days and no cancellation at the period end is scheduled.
//    Their amount is the plan price without GST (a tax-inclusive plan has its GST taken out at billing.gst_rate_percent).
//  - Renewal paid: a captured, refunded or part-refunded payment that is not the school's first payment on that subscription.
//  - Renewal failed: an audit entry "subscription.past_due" (written by the payment webhook and by the offline expiry job).
//  - Renewal rate = paid / (paid + failed) in the period. 0 when nothing was due.
//  - Subscription ended: status Cancelled or Expired, at ended_at (else cancelled_at, else the last update).
//  - Churn rate = subscriptions ended in the period / subscriptions that were running at the start of the period
//    (started before the period and not ended before it). 0 when none were running.
//  - Past-due recovery: of the subscriptions that went past due in the period (first failure counted), the share that has
//    a later paid payment. The funnel also shows where the others stand now (grace days come from policy.grace_days).
//  - Lifetime of ended subscriptions: days from started_at to the end, for subscriptions that ended in the period.
//  - At risk table: Past due subscriptions (days left = grace days still left, negative when over) and Active ones due
//    within renewals.due_soon_days. Sorted by days left.

const SOON_COUNT = 30;

const subscriptionFilterSql = (filters) => {
  let sql = '';
  const replacements = {};
  if (filters.plan) {
    sql += ' AND s.plan_id IN (:planIds)';
    replacements.planIds = filters.plan.ids;
  }
  if (filters.source) {
    sql += ' AND s.source IN (:sources)';
    replacements.sources = filters.source;
  }
  return { sql, replacements };
};

const FROM_SUBSCRIPTIONS = 'FROM subscriptions s JOIN plans p ON p.id = s.plan_id JOIN clients c ON c.id = s.client_id';
const LIVE = 's.deleted_at IS NULL AND c.deleted_at IS NULL';
const PAID = 'IN (3, 5, 6)';
const ENDED_AT = 'COALESCE(s.ended_at, s.cancelled_at, s.updated_at)';

const periodNumbers = async ({ from, to, filters, graceDays, now }) => {
  const extra = subscriptionFilterSql(filters);
  const params = { from, to, graceDays, now, ...extra.replacements };

  const [paid, failed, ended, activeAtStart, funnel, lifetime] = await Promise.all([
    select(
      `SELECT COUNT(*)::int AS value
         FROM payments pay JOIN subscriptions s ON s.id = pay.subscription_id JOIN plans p ON p.id = s.plan_id JOIN clients c ON c.id = s.client_id
        WHERE ${LIVE} AND pay.status ${PAID} AND pay.paid_at >= :from AND pay.paid_at <= :to${extra.sql}
          AND EXISTS (SELECT 1 FROM payments e WHERE e.subscription_id = pay.subscription_id AND e.status ${PAID} AND e.paid_at < pay.paid_at)`,
      params,
    ),
    select(
      `SELECT COUNT(*)::int AS value
         FROM audit_logs a JOIN subscriptions s ON s.uuid = a.entity_uuid JOIN plans p ON p.id = s.plan_id JOIN clients c ON c.id = s.client_id
        WHERE ${LIVE} AND a.entity_type = 'subscription' AND a.action = 'subscription.past_due' AND a.created_at >= :from AND a.created_at <= :to${extra.sql}`,
      params,
    ),
    select(`SELECT COUNT(*)::int AS value ${FROM_SUBSCRIPTIONS} WHERE ${LIVE} AND s.status IN (4, 5) AND ${ENDED_AT} >= :from AND ${ENDED_AT} <= :to${extra.sql}`, params),
    select(
      `SELECT COUNT(*)::int AS value ${FROM_SUBSCRIPTIONS}
        WHERE ${LIVE} AND s.started_at IS NOT NULL AND s.started_at < :from
          AND NOT (s.status IN (4, 5) AND ${ENDED_AT} < :from)${extra.sql}`,
      params,
    ),
    select(
      `WITH first_fail AS (
         SELECT s.id AS sid, MIN(a.created_at) AS at
           FROM audit_logs a JOIN subscriptions s ON s.uuid = a.entity_uuid JOIN plans p ON p.id = s.plan_id JOIN clients c ON c.id = s.client_id
          WHERE ${LIVE} AND a.entity_type = 'subscription' AND a.action = 'subscription.past_due' AND a.created_at >= :from AND a.created_at <= :to${extra.sql}
          GROUP BY s.id
       )
       SELECT COUNT(*)::int AS "wentPastDue",
              COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM payments pay WHERE pay.subscription_id = f.sid AND pay.status ${PAID} AND pay.paid_at > f.at))::int AS recovered,
              COUNT(*) FILTER (WHERE s.status = 3 AND COALESCE(s.past_due_since, f.at) + (:graceDays * INTERVAL '1 day') > :now)::int AS "stillInGrace",
              COUNT(*) FILTER (WHERE s.status = 6)::int AS suspended,
              COUNT(*) FILTER (WHERE s.status IN (4, 5))::int AS ended
         FROM first_fail f JOIN subscriptions s ON s.id = f.sid`,
      params,
    ),
    select(
      `SELECT COUNT(*) FILTER (WHERE days < 30)::int AS "under1",
              COUNT(*) FILTER (WHERE days >= 30 AND days < 90)::int AS "m1to3",
              COUNT(*) FILTER (WHERE days >= 90 AND days < 180)::int AS "m3to6",
              COUNT(*) FILTER (WHERE days >= 180 AND days < 365)::int AS "m6to12",
              COUNT(*) FILTER (WHERE days >= 365)::int AS "over12",
              COALESCE(AVG(days), 0)::float AS average
         FROM (
           SELECT EXTRACT(EPOCH FROM (${ENDED_AT} - s.started_at)) / 86400.0 AS days, ${ENDED_AT} AS ended_time
             ${FROM_SUBSCRIPTIONS}
            WHERE ${LIVE} AND s.status IN (4, 5) AND s.started_at IS NOT NULL${extra.sql}
         ) x
        WHERE x.ended_time >= :from AND x.ended_time <= :to AND x.days >= 0`,
      params,
    ),
  ]);

  const f = funnel[0];
  return {
    paid: paid[0].value,
    failed: failed[0].value,
    ended: ended[0].value,
    activeAtStart: activeAtStart[0].value,
    funnel: f,
    lifetime: lifetime[0],
    renewalRate: percentOf(paid[0].value, paid[0].value + failed[0].value),
    churnRate: percentOf(ended[0].value, activeAtStart[0].value),
    recoveryRate: percentOf(f.recovered, f.wentPastDue),
  };
};

module.exports = {
  key: 'renewals.churn',
  area: 'renewals-churn',
  title: 'Renewals and churn',
  description: 'What renews soon, how renewals went, who left and how many failed payments were recovered.',
  filters: ['plan', 'source'],
  sourceKind: 'subscription',
  exportTable: 'atRisk',

  async run({ range, filters }) {
    const now = new Date();
    const graceDays = Number(await Settings.get('policy.grace_days')) || 0;
    const dueSoonDays = Number(await Settings.get('renewals.due_soon_days')) || 7;
    const rate = await gstRate();
    const extra = subscriptionFilterSql(filters);
    const buckets = bucketLabels(range);
    const labels = buckets.map((bucket) => bucket.label);

    // the next 30 days (not tied to the date range: it always looks forward from today)
    const soon = nextDays(SOON_COUNT, now);
    const soonBuckets = bucketLabels(dailyRange(soon.days));
    const dueRows = await select(
      `SELECT ${bucketSql('day', 'due.due_at')} AS bucket, COUNT(*)::int AS count, COALESCE(SUM(due.amount), 0)::bigint AS amount
         FROM (SELECT COALESCE(s.next_charge_at, s.current_period_end) AS due_at, ${exGstSql('p')} AS amount
                 ${FROM_SUBSCRIPTIONS}
                WHERE ${LIVE} AND s.status = 2 AND s.cancel_at_cycle_end = 0${extra.sql}) due
        WHERE due.due_at >= :now AND due.due_at < :until
        GROUP BY 1`,
      { now, until: soon.until, gstRate: rate, ...extra.replacements },
    );
    const dueCounts = fillBuckets(dueRows, soonBuckets, 'count');
    const dueAmounts = fillBuckets(dueRows, soonBuckets, 'amount');

    // the period, and the one before it when compare is on
    const current = await periodNumbers({ from: range.fromDate, to: range.toDate, filters, graceDays, now });
    const before = range.previous ? await periodNumbers({ from: range.previous.fromDate, to: range.previous.toDate, filters, graceDays, now }) : null;

    // paid and failed renewals, and ended subscriptions per period
    const [paidSeries, failedSeries, endedSeries] = await Promise.all([
      select(
        `SELECT ${bucketSql(range.granularity, 'pay.paid_at')} AS bucket, COUNT(*)::int AS value
           FROM payments pay JOIN subscriptions s ON s.id = pay.subscription_id JOIN plans p ON p.id = s.plan_id JOIN clients c ON c.id = s.client_id
          WHERE ${LIVE} AND pay.status ${PAID} AND pay.paid_at >= :from AND pay.paid_at <= :to${extra.sql}
            AND EXISTS (SELECT 1 FROM payments e WHERE e.subscription_id = pay.subscription_id AND e.status ${PAID} AND e.paid_at < pay.paid_at)
          GROUP BY 1`,
        { from: range.fromDate, to: range.toDate, ...extra.replacements },
      ),
      select(
        `SELECT ${bucketSql(range.granularity, 'a.created_at')} AS bucket, COUNT(*)::int AS value
           FROM audit_logs a JOIN subscriptions s ON s.uuid = a.entity_uuid JOIN plans p ON p.id = s.plan_id JOIN clients c ON c.id = s.client_id
          WHERE ${LIVE} AND a.entity_type = 'subscription' AND a.action = 'subscription.past_due' AND a.created_at >= :from AND a.created_at <= :to${extra.sql}
          GROUP BY 1`,
        { from: range.fromDate, to: range.toDate, ...extra.replacements },
      ),
      select(
        `SELECT ${bucketSql(range.granularity, 'e.ended_time')} AS bucket, COUNT(*)::int AS value
           FROM (SELECT ${ENDED_AT} AS ended_time ${FROM_SUBSCRIPTIONS} WHERE ${LIVE} AND s.status IN (4, 5)${extra.sql}) e
          WHERE e.ended_time >= :from AND e.ended_time <= :to
          GROUP BY 1`,
        { from: range.fromDate, to: range.toDate, ...extra.replacements },
      ),
    ]);
    const paidPerBucket = fillBuckets(paidSeries, buckets);
    const failedPerBucket = fillBuckets(failedSeries, buckets);
    const endedPerBucket = fillBuckets(endedSeries, buckets);

    // schools that need attention: past due now, or active and due within the "due soon" window
    const soonLimit = new Date(now.getTime() + dueSoonDays * 86400000);
    const riskRows = await select(
      `SELECT c.name AS school, p.name AS plan, s.status, s.source, ${exGstSql('p')} AS "amountPaise",
              CASE WHEN s.status = 3 THEN COALESCE(s.past_due_since, s.updated_at) ELSE COALESCE(s.next_charge_at, s.current_period_end) END AS "keyDate"
         ${FROM_SUBSCRIPTIONS}
        WHERE ${LIVE}${extra.sql}
          AND (s.status = 3 OR (s.status = 2 AND COALESCE(s.next_charge_at, s.current_period_end) <= :soonLimit))
        ORDER BY 1
        LIMIT 500`,
      { soonLimit, gstRate: rate, ...extra.replacements },
    );
    const atRisk = riskRows
      .map((row) => {
        const pastDue = Number(row.status) === 3;
        const daysLeft = pastDue ? graceDays - Math.floor((now.getTime() - new Date(row.keyDate).getTime()) / 86400000) : daysUntil(row.keyDate, now);
        return {
          school: row.school,
          plan: row.plan,
          status: optionSets.label('subscriptionStatus', row.status),
          reason: pastDue ? 'Payment failed' : 'Renews soon',
          source: optionSets.label('billingSource', row.source),
          amountPaise: Number(row.amountPaise),
          keyDate: row.keyDate,
          daysLeft,
        };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft || a.school.localeCompare(b.school));

    const lifetimeBuckets = [
      ['< 1 mo', current.lifetime.under1],
      ['1-3 mo', current.lifetime.m1to3],
      ['3-6 mo', current.lifetime.m3to6],
      ['6-12 mo', current.lifetime.m6to12],
      ['1 yr +', current.lifetime.over12],
    ];
    const f = current.funnel;
    const compare = (key) => (before ? before[key] : undefined);

    return {
      kpis: [
        kpi({ key: 'dueIn30Days', label: 'Renewals due in 30 days', value: dueCounts.reduce((a, b) => a + b, 0), sparkline: dueCounts }),
        kpi({ key: 'expectedAmount', label: 'Expected in 30 days', value: dueAmounts.reduce((a, b) => a + b, 0), unit: 'money', sparkline: dueAmounts }),
        kpi({ key: 'renewalRate', label: 'Renewal rate', value: current.renewalRate, previous: compare('renewalRate'), unit: 'percent' }),
        kpi({ key: 'churnRate', label: 'Churn rate', value: current.churnRate, previous: compare('churnRate'), unit: 'percent' }),
        kpi({ key: 'ended', label: 'Subscriptions ended', value: current.ended, previous: compare('ended'), sparkline: endedPerBucket }),
        kpi({ key: 'failedRenewals', label: 'Failed renewals', value: current.failed, previous: compare('failed'), sparkline: failedPerBucket }),
        kpi({ key: 'recoveryRate', label: 'Past-due recovery', value: current.recoveryRate, previous: compare('recoveryRate'), unit: 'percent' }),
        kpi({ key: 'avgLifetime', label: 'Average lifetime of ended', value: round1(current.lifetime.average), previous: before ? round1(before.lifetime.average) : undefined, unit: 'days' }),
      ],
      series: {
        dueNext30: { labels: soonBuckets.map((bucket) => bucket.label), datasets: [{ key: 'count', label: 'Renewals due', data: dueCounts }] },
        dueAmount: { labels: soonBuckets.map((bucket) => bucket.label), datasets: [{ key: 'amount', label: 'Expected amount', unit: 'money', data: dueAmounts }] },
        outcomes: {
          labels,
          datasets: [
            { key: 'paid', label: 'Renewals paid', data: paidPerBucket },
            { key: 'failed', label: 'Renewals failed', data: failedPerBucket },
          ],
        },
        ended: { labels, datasets: [{ key: 'ended', label: 'Subscriptions ended', data: endedPerBucket }] },
        funnel: {
          labels: ['Past due', 'Paid again', 'In grace', 'Suspended', 'Ended'],
          datasets: [{ key: 'schools', label: 'Subscriptions', data: [f.wentPastDue, f.recovered, f.stillInGrace, f.suspended, f.ended] }],
        },
        lifetime: { labels: lifetimeBuckets.map((item) => item[0]), datasets: [{ key: 'ended', label: 'Ended subscriptions', data: lifetimeBuckets.map((item) => item[1]) }] },
      },
      tables: {
        atRisk: {
          columns: [
            { key: 'school', label: 'School', type: 'text' },
            { key: 'plan', label: 'Plan', type: 'text' },
            { key: 'reason', label: 'Why', type: 'text' },
            { key: 'source', label: 'Billing', type: 'text' },
            { key: 'amountPaise', label: 'Amount (no GST)', type: 'money' },
            { key: 'keyDate', label: 'Since or due on', type: 'datetime' },
            { key: 'daysLeft', label: 'Days left', type: 'integer' },
          ],
          rows: atRisk,
        },
      },
    };
  },
};
