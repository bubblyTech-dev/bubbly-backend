const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const Settings = require('@app/Helpers/settings');
const safeSetting = require('@app/Helpers/safeSetting');
const optionSets = require('@app/Services/V1/Admin/Reports/optionSets');
const RangeService = require('@app/Services/V1/Admin/Reports/RangeService');
const { resolveRange, todayIn, addMonths, TIMEZONE } = require('@app/Helpers/dateRange');
const { bucketLabels, bucketSql, fillBuckets, kpi } = require('@app/Services/V1/Admin/Analytics/series');
const { SUBSCRIPTION_STATUS, CLIENT_STATUS, INQUIRY_STATUS, PAYMENT_STATUS, INVOICE_STATUS, WEBHOOK_EVENT_STATUS, ANNOUNCEMENT_STATUS } = require('@app/Helpers/constants');

// The numbers behind the main Dashboard. One call, a handful of aggregate queries run in parallel, and every block
// is computed only when the admin holds the permission of its source (otherwise it is null and the page hides it).
//
// Rules for the money numbers (all in paise, always WITHOUT GST):
//   Revenue   Paid invoices issued in the range: the sum of `subtotal_paise`, minus the refunds of those payments
//             expressed without GST (refunded_paise x subtotal / total of that invoice). A refund is attributed to the
//             period of the ORIGINAL invoice, because the date of a refund is not stored.
//   GST       the tax of the same invoices (`tax_paise`), reduced by the GST share of the same refunds.
//   MRR       every Active subscription counted as a monthly amount without GST:
//               plan price (a tax-inclusive price has its GST taken out with the GST rate setting)
//               divided by the months in its billing period (monthly 1, quarterly 3, yearly 12).
//             ARR is MRR x 12.
//   Change    "previous" values compare with the window of the same length right before the range. There is no stored
//             history of past statuses, so the previous Active count and MRR are ESTIMATES: subscriptions that had
//             started by the end of that window and had not ended or been cancelled by then.
// Anything shown as a count of attention items, "due soon" or "ending soon" uses renewals.due_soon_days from Settings.

const S = SUBSCRIPTION_STATUS;
const OFFLINE_SOURCE = 2; // subscriptions.source: 1 Razorpay, 2 Offline

const can = (admin, key) => Boolean(admin.isMaster || (admin.permissions || []).includes(key));

const query = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

const one = async (sql, replacements) => (await query(sql, replacements))[0] || {};

// the monthly amount without GST of one subscription row (s) with its plan (p)
const MONTHLY_EX_GST = `(
  (CASE
     WHEN p.id IS NULL THEN s.amount_paise
     WHEN p.tax_inclusive = 1 THEN p.price_paise * 100.0 / (100 + :rate)
     ELSE p.price_paise
   END) / (CASE s.billing_interval WHEN 2 THEN 3 WHEN 3 THEN 12 ELSE 1 END)
)`;

// the part of an invoice that was refunded, without GST, and the GST share of it
const REFUND_EX_GST = `(CASE WHEN i.total_paise > 0 THEN ROUND(COALESCE(pay.refunded_paise, 0) * i.subtotal_paise::numeric / i.total_paise) ELSE 0 END)`;
const REFUND_GST = `(CASE WHEN i.total_paise > 0 THEN ROUND(COALESCE(pay.refunded_paise, 0) * i.tax_paise::numeric / i.total_paise) ELSE 0 END)`;

// ---------------------------------------------------------------------------------------------------- KPIs

const schoolKpis = async (range) => {
  const previous = range.previous;
  const row = await one(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = :active)::int AS active,
            COUNT(*) FILTER (WHERE status = :suspended)::int AS suspended,
            COUNT(*) FILTER (WHERE status = :archived)::int AS archived,
            COUNT(*) FILTER (WHERE created_at >= :from AND created_at <= :to)::int AS "newNow",
            COUNT(*) FILTER (WHERE created_at >= :pFrom AND created_at <= :pTo)::int AS "newBefore",
            COUNT(*) FILTER (WHERE created_at <= :pTo)::int AS "totalBefore"
       FROM clients
      WHERE deleted_at IS NULL`,
    {
      active: CLIENT_STATUS.ACTIVE,
      suspended: CLIENT_STATUS.SUSPENDED,
      archived: CLIENT_STATUS.ARCHIVED,
      from: range.fromDate,
      to: range.toDate,
      pFrom: previous.fromDate,
      pTo: previous.toDate,
    },
  );

  const buckets = bucketLabels(range);
  const perBucket = await query(
    `SELECT ${bucketSql(range.granularity, 'created_at')} AS bucket, COUNT(*)::int AS value
       FROM clients WHERE deleted_at IS NULL AND created_at >= :from AND created_at <= :to GROUP BY 1`,
    { from: range.fromDate, to: range.toDate },
  );

  return {
    totalSchools: {
      ...kpi({ key: 'totalSchools', label: 'Total schools', value: row.total, previous: row.totalBefore, unit: 'count' }),
      breakdown: { active: row.active, suspended: row.suspended, archived: row.archived },
    },
    newSchools: kpi({ key: 'newSchools', label: 'New schools', value: row.newNow, previous: row.newBefore, unit: 'count', sparkline: fillBuckets(perBucket, buckets) }),
  };
};

const subscriptionKpis = async (range, gstRate) => {
  const previous = range.previous;
  const startedBy = `s.started_at IS NOT NULL AND s.started_at <= :pTo AND (s.ended_at IS NULL OR s.ended_at > :pTo) AND (s.cancelled_at IS NULL OR s.cancelled_at > :pTo)`;

  const [now, before] = await Promise.all([
    one(
      `SELECT COUNT(*)::int AS active, COALESCE(ROUND(SUM(${MONTHLY_EX_GST})), 0)::bigint AS mrr
         FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id
        WHERE s.deleted_at IS NULL AND s.status = :active`,
      { active: S.ACTIVE, rate: gstRate },
    ),
    one(
      `SELECT COUNT(*)::int AS active, COALESCE(ROUND(SUM(${MONTHLY_EX_GST})), 0)::bigint AS mrr
         FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id
        WHERE s.deleted_at IS NULL AND ${startedBy}`,
      { rate: gstRate, pTo: previous.toDate },
    ),
  ]);

  const mrr = Number(now.mrr);
  return {
    activeSubscriptions: kpi({ key: 'activeSubscriptions', label: 'Active subscriptions', value: now.active, previous: before.active, unit: 'count' }),
    mrr: { ...kpi({ key: 'mrr', label: 'Monthly recurring revenue', value: mrr, previous: Number(before.mrr), unit: 'money' }), arrPaise: mrr * 12 },
  };
};

const revenueKpi = async (range) => {
  const sql = (from, to) =>
    one(
      `SELECT COALESCE(SUM(i.subtotal_paise), 0)::bigint AS gross,
              COALESCE(SUM(i.tax_paise), 0)::bigint AS tax,
              COALESCE(SUM(${REFUND_EX_GST}), 0)::bigint AS "refundedNet",
              COALESCE(SUM(${REFUND_GST}), 0)::bigint AS "refundedGst"
         FROM invoices i LEFT JOIN payments pay ON pay.id = i.payment_id
        WHERE i.status = :paid AND i.issued_at >= :from AND i.issued_at <= :to`,
      { paid: INVOICE_STATUS.PAID, from, to },
    );

  const [now, before] = await Promise.all([sql(range.fromDate, range.toDate), sql(range.previous.fromDate, range.previous.toDate)]);

  const net = Number(now.gross) - Number(now.refundedNet);
  const netBefore = Number(before.gross) - Number(before.refundedNet);

  const buckets = bucketLabels(range);
  const perBucket = await query(
    `SELECT ${bucketSql(range.granularity, 'i.issued_at')} AS bucket,
            COALESCE(SUM(i.subtotal_paise - ${REFUND_EX_GST}), 0)::bigint AS value
       FROM invoices i LEFT JOIN payments pay ON pay.id = i.payment_id
      WHERE i.status = :paid AND i.issued_at >= :from AND i.issued_at <= :to GROUP BY 1`,
    { paid: INVOICE_STATUS.PAID, from: range.fromDate, to: range.toDate },
  );

  return {
    revenue: {
      ...kpi({ key: 'revenue', label: 'Revenue (without GST)', value: net, previous: netBefore, unit: 'money', sparkline: fillBuckets(perBucket, buckets) }),
      gstPaise: Number(now.tax) - Number(now.refundedGst),
      refundedPaise: Number(now.refundedNet),
    },
  };
};

const renewalKpis = async (dueSoonDays, range) => {
  const row = await one(
    `SELECT COUNT(*) FILTER (WHERE status = :active AND COALESCE(next_charge_at, current_period_end) <= :limit)::int AS "dueSoon",
            COUNT(*) FILTER (WHERE status = :pastDue)::int AS "pastDue"
       FROM subscriptions WHERE deleted_at IS NULL`,
    { active: S.ACTIVE, pastDue: S.PAST_DUE, limit: new Date(Date.now() + dueSoonDays * 86400000) },
  );
  const failed = await one(
    `SELECT COUNT(*)::int AS value FROM payments WHERE status = :failed AND created_at >= :from AND created_at <= :to`,
    { failed: PAYMENT_STATUS.FAILED, from: range.fromDate, to: range.toDate },
  );

  return {
    renewalsDue: { ...kpi({ key: 'renewalsDue', label: 'Renewals due', value: row.dueSoon, unit: 'count' }), windowDays: dueSoonDays },
    pastDue: { ...kpi({ key: 'pastDue', label: 'Failed or past due', value: row.pastDue, unit: 'count' }), failedPaymentsInRange: failed.value },
  };
};

const inquiryKpis = async (range) => {
  const previous = range.previous;
  const row = await one(
    `SELECT COUNT(*) FILTER (WHERE created_at >= :from AND created_at <= :to)::int AS "now",
            COUNT(*) FILTER (WHERE created_at >= :pFrom AND created_at <= :pTo)::int AS "before",
            COUNT(*) FILTER (WHERE status = :new)::int AS waiting
       FROM inquiries WHERE deleted_at IS NULL`,
    { from: range.fromDate, to: range.toDate, pFrom: previous.fromDate, pTo: previous.toDate, new: INQUIRY_STATUS.NEW },
  );

  const buckets = bucketLabels(range);
  const perBucket = await query(
    `SELECT ${bucketSql(range.granularity, 'created_at')} AS bucket, COUNT(*)::int AS value
       FROM inquiries WHERE deleted_at IS NULL AND created_at >= :from AND created_at <= :to GROUP BY 1`,
    { from: range.fromDate, to: range.toDate },
  );

  return {
    newInquiries: { ...kpi({ key: 'newInquiries', label: 'New inquiries', value: row.now, previous: row.before, unit: 'count', sparkline: fillBuckets(perBucket, buckets) }), waiting: row.waiting },
  };
};

// ---------------------------------------------------------------------------------------------------- charts

// the last 12 calendar months (this month and the 11 before it), always, whatever range the page shows
const lastTwelveMonths = async (now) => {
  const today = todayIn(now, TIMEZONE);
  const start = addMonths(`${today.slice(0, 7)}-01`, -11);
  return resolveRange({ preset: 'custom', from: start, to: today }, { now });
};

const monthlyCharts = async (admin, now) => {
  const months = await lastTwelveMonths(now);
  const buckets = bucketLabels(months);
  const labels = buckets.map((bucket) => bucket.label);
  const charts = {};

  if (can(admin, 'billing.view')) {
    const rows = await query(
      `SELECT ${bucketSql('month', 'i.issued_at')} AS bucket, COALESCE(SUM(i.subtotal_paise - ${REFUND_EX_GST}), 0)::bigint AS value
         FROM invoices i LEFT JOIN payments pay ON pay.id = i.payment_id
        WHERE i.status = :paid AND i.issued_at >= :from AND i.issued_at <= :to GROUP BY 1`,
      { paid: INVOICE_STATUS.PAID, from: months.fromDate, to: months.toDate },
    );
    charts.revenueByMonth = { labels, datasets: [{ key: 'revenue', label: 'Revenue (without GST)', unit: 'money', data: fillBuckets(rows, buckets) }] };
  }

  if (can(admin, 'schools.view')) {
    const rows = await query(
      `SELECT ${bucketSql('month', 'created_at')} AS bucket, COUNT(*)::int AS value
         FROM clients WHERE deleted_at IS NULL AND created_at >= :from AND created_at <= :to GROUP BY 1`,
      { from: months.fromDate, to: months.toDate },
    );
    charts.newSchoolsByMonth = { labels, datasets: [{ key: 'schools', label: 'New schools', unit: 'count', data: fillBuckets(rows, buckets) }] };
  }

  return charts;
};

const subscriptionCharts = async () => {
  const [byStatus, byPlan] = await Promise.all([
    query(`SELECT status, COUNT(*)::int AS value FROM subscriptions WHERE deleted_at IS NULL GROUP BY status ORDER BY status`),
    query(
      `SELECT COALESCE(p.name, 'No plan') AS label, COUNT(DISTINCT s.client_id)::int AS value
         FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id
        WHERE s.deleted_at IS NULL AND s.status IN (:active, :pastDue)
        GROUP BY 1 ORDER BY value DESC, label LIMIT 8`,
      { active: S.ACTIVE, pastDue: S.PAST_DUE },
    ),
  ]);

  return {
    subscriptionsByStatus: byStatus.map((row) => ({ label: optionSets.label('subscriptionStatus', row.status), value: row.value })),
    schoolsPerPlan: byPlan.map((row) => ({ label: row.label, value: row.value })),
  };
};

// ---------------------------------------------------------------------------------------------------- needs attention

const attention = async (admin, dueSoonDays) => {
  const now = new Date();
  const limit = new Date(now.getTime() + dueSoonDays * 86400000);
  const items = [];
  const jobs = [];

  if (can(admin, 'renewals.view')) {
    jobs.push(
      one(
        `SELECT COUNT(*) FILTER (WHERE status = :pastDue)::int AS "pastDue",
                COUNT(*) FILTER (WHERE status = :suspended)::int AS suspended,
                COUNT(*) FILTER (WHERE status = :active AND source = :offline AND current_period_end >= :now AND current_period_end <= :limit)::int AS "offlineExpiring"
           FROM subscriptions WHERE deleted_at IS NULL`,
        { pastDue: S.PAST_DUE, suspended: S.SUSPENDED, active: S.ACTIVE, offline: OFFLINE_SOURCE, now, limit },
      ).then((row) => {
        items.push({ key: 'pastDue', label: 'Schools with a failed payment (past due)', count: row.pastDue, severity: 'error', link: '/renewals' });
        items.push({ key: 'suspendedForPayment', label: 'Schools suspended for non-payment', count: row.suspended, severity: 'error', link: '/renewals' });
        items.push({ key: 'offlineExpiring', label: `Offline schools expiring within ${dueSoonDays} days`, count: row.offlineExpiring, severity: 'warning', link: '/renewals' });
      }),
    );
  }

  if (can(admin, 'billing.view')) {
    jobs.push(
      one(`SELECT COUNT(*)::int AS value FROM webhook_events WHERE status = :failed`, { failed: WEBHOOK_EVENT_STATUS.FAILED }).then((row) => {
        items.push({ key: 'failedWebhooks', label: 'Payment events that failed to process', count: row.value, severity: 'error', link: '/webhook-events' });
      }),
    );
  }

  if (can(admin, 'inquiries.view')) {
    jobs.push(
      one(`SELECT COUNT(*)::int AS value FROM inquiries WHERE deleted_at IS NULL AND status = :new AND assigned_to IS NULL`, { new: INQUIRY_STATUS.NEW }).then((row) => {
        items.push({ key: 'unassignedInquiries', label: 'New inquiries nobody has picked up', count: row.value, severity: 'warning', link: '/inquiries' });
      }),
    );
  }

  if (can(admin, 'announcements.view')) {
    jobs.push(
      one(
        `SELECT COUNT(*)::int AS value FROM announcements
          WHERE deleted_at IS NULL AND status = :published AND ends_at IS NOT NULL AND ends_at >= :now AND ends_at <= :limit`,
        { published: ANNOUNCEMENT_STATUS.PUBLISHED, now, limit },
      ).then((row) => {
        items.push({ key: 'announcementsEnding', label: `Announcements ending within ${dueSoonDays} days`, count: row.value, severity: 'info', link: '/announcements' });
      }),
    );
  }

  await Promise.all(jobs);

  const order = ['pastDue', 'suspendedForPayment', 'failedWebhooks', 'offlineExpiring', 'unassignedInquiries', 'announcementsEnding'];
  return items.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
};

// ---------------------------------------------------------------------------------------------------- panels

const panels = async (admin) => {
  const result = { recentActivity: null, latestSchools: null, latestPayments: null, liveAnnouncements: null };
  const jobs = [];

  if (can(admin, 'audit.view')) {
    // the owner account's own actions are visible to the owner only (same rule as the audit log page)
    jobs.push(
      query(
        `SELECT uuid, action, description, actor_name AS "actorName", entity_type AS "entityType", created_at AS "createdAt"
           FROM audit_logs ${admin.isMaster ? '' : 'WHERE COALESCE(actor_is_master, 0) = 0'}
          ORDER BY created_at DESC, id DESC LIMIT 8`,
      ).then((rows) => {
        result.recentActivity = rows;
      }),
    );
  }

  if (can(admin, 'schools.view')) {
    jobs.push(
      query(
        `SELECT c.uuid, c.name, c.city, c.status, c.created_at AS "createdAt", plan.name AS "planName"
           FROM clients c
           LEFT JOIN LATERAL (
             SELECT p.name FROM subscriptions s JOIN plans p ON p.id = s.plan_id
              WHERE s.client_id = c.id AND s.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 1
           ) plan ON TRUE
          WHERE c.deleted_at IS NULL ORDER BY c.created_at DESC, c.id DESC LIMIT 5`,
      ).then((rows) => {
        result.latestSchools = rows;
      }),
    );
  }

  if (can(admin, 'billing.view')) {
    jobs.push(
      query(
        `SELECT pay.uuid, c.name AS "schoolName", pay.amount_paise AS "amountPaise", pay.status, pay.source,
                COALESCE(pay.paid_at, pay.created_at) AS "at"
           FROM payments pay LEFT JOIN clients c ON c.id = pay.client_id
          ORDER BY COALESCE(pay.paid_at, pay.created_at) DESC, pay.id DESC LIMIT 5`,
      ).then((rows) => {
        result.latestPayments = rows;
      }),
    );
  }

  if (can(admin, 'announcements.view')) {
    jobs.push(
      query(
        `SELECT uuid, title, type, starts_at AS "startsAt", ends_at AS "endsAt"
           FROM announcements
          WHERE deleted_at IS NULL AND status = :published
            AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at > NOW())
          ORDER BY published_at DESC NULLS LAST, id DESC LIMIT 3`,
        { published: ANNOUNCEMENT_STATUS.PUBLISHED },
      ).then((rows) => {
        result.liveAnnouncements = rows;
      }),
    );
  }

  await Promise.all(jobs);
  return result;
};

// ---------------------------------------------------------------------------------------------------- the whole page

const build = async (admin, input = {}) => {
  const now = new Date();
  // the page compares with the period before, always; "this month" unless the admin picked another range
  const range = await RangeService.fromQuery({ ...input, preset: input.preset || 'this_month', compare: true }, { now });
  const gstRate = Number(await Settings.get('billing.gst_rate_percent'));
  const dueSoonDays = Number(await safeSetting('renewals.due_soon_days', 7));

  const kpis = {
    totalSchools: null,
    newSchools: null,
    activeSubscriptions: null,
    mrr: null,
    revenue: null,
    renewalsDue: null,
    pastDue: null,
    newInquiries: null,
  };
  const jobs = [];

  if (can(admin, 'schools.view')) jobs.push(schoolKpis(range).then((value) => Object.assign(kpis, value)));
  if (can(admin, 'subscriptions.view')) jobs.push(subscriptionKpis(range, gstRate).then((value) => Object.assign(kpis, value)));
  if (can(admin, 'billing.view')) jobs.push(revenueKpi(range).then((value) => Object.assign(kpis, value)));
  if (can(admin, 'renewals.view')) jobs.push(renewalKpis(dueSoonDays, range).then((value) => Object.assign(kpis, value)));
  if (can(admin, 'inquiries.view')) jobs.push(inquiryKpis(range).then((value) => Object.assign(kpis, value)));

  const charts = { revenueByMonth: null, newSchoolsByMonth: null, subscriptionsByStatus: null, schoolsPerPlan: null };
  jobs.push(monthlyCharts(admin, now).then((value) => Object.assign(charts, value)));
  if (can(admin, 'subscriptions.view')) jobs.push(subscriptionCharts().then((value) => Object.assign(charts, value)));

  const [attentionItems, panelData] = await Promise.all([attention(admin, dueSoonDays), panels(admin), ...jobs]);

  return { range, generatedAt: now, kpis, charts, attention: attentionItems, panels: panelData };
};

module.exports = { build };
