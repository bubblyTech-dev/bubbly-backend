const { Op, QueryTypes } = require('sequelize');
const Audit = require('@app/Helpers/audit');
const logger = require('@app/Helpers/logger');
const Settings = require('@app/Helpers/settings');
const { sequelize } = require('@app/Helpers/database');
const { BILLING_SOURCE, SUBSCRIPTION_STATUS, YES } = require('@app/Helpers/constants');
const { Client, Subscription } = require('@app/Models');

// Razorpay tells us when a Razorpay subscription changes (the webhook). Nobody tells us when an OFFLINE school's
// "valid until" date passes, so this job does it. It only touches subscriptions with source Offline.
//
//   Active   and its period ended                      -> Past due   (or Cancelled when it was set to end at the period end)
//   Past due and the grace days since it ended passed  -> Suspended  (policy.grace_days)
//   Suspended and the suspension days since then passed-> Expired    (policy.suspension_after_days, skipped when 0 or empty)
//
// Every step counts from the end of the paid period (not from when the job ran), so the result does not depend on
// how often the job runs. Each change is written to the audit log as System with the school's id.
//
// runOnce(now) is a plain function (tests pass a fake clock). start() runs it at startup and then every hour; two
// servers can run it together, a Postgres advisory lock lets only one of them work at a time.

const S = SUBSCRIPTION_STATUS;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const days = async (key) => {
  try {
    const value = Number(await Settings.get(key));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (error) {
    return 0;
  }
};

const clientInclude = { model: Client, as: 'client', attributes: ['id', 'uuid', 'name'] };

const move = async (subscription, status, extra, action, description, transaction) => {
  const before = { status: Number(subscription.status) };
  await subscription.update({ status, ...extra }, { transaction });
  await Audit.log(
    {},
    action,
    {
      entityType: 'subscription',
      entityUuid: subscription.uuid,
      clientId: subscription.clientId,
      description,
      before,
      after: { status },
    },
    { transaction },
  );
};

const runOnce = async (now = new Date()) =>
  sequelize.transaction(async (transaction) => {
    const [{ locked }] = await sequelize.query('SELECT pg_try_advisory_xact_lock(hashtext(:key)) AS locked', {
      replacements: { key: 'subscription-expiry-job' },
      type: QueryTypes.SELECT,
      transaction,
    });
    if (!locked) return { skipped: true, pastDue: 0, cancelled: 0, suspended: 0, expired: 0 };

    const graceDays = await days('policy.grace_days');
    const suspensionDays = await days('policy.suspension_after_days');
    const summary = { skipped: false, pastDue: 0, cancelled: 0, suspended: 0, expired: 0 };
    const offline = { source: BILLING_SOURCE.OFFLINE };

    // 1. the paid period ended
    const ended = await Subscription.findAll({
      where: { ...offline, status: S.ACTIVE, currentPeriodEnd: { [Op.lt]: now } },
      include: [clientInclude],
      transaction,
    });
    for (const subscription of ended) {
      if (Number(subscription.cancelAtCycleEnd) === YES) {
        await move(
          subscription,
          S.CANCELLED,
          { cancelledAt: subscription.currentPeriodEnd, endedAt: subscription.currentPeriodEnd },
          'subscription.cancelled',
          `The subscription of ${subscription.client.name} ended as requested (offline)`,
          transaction,
        );
        summary.cancelled += 1;
      } else {
        await move(
          subscription,
          S.PAST_DUE,
          {},
          'subscription.past_due',
          `The paid period of ${subscription.client.name} ended (offline)`,
          transaction,
        );
        summary.pastDue += 1;
      }
    }

    // 2. grace days after the end of the paid period
    const late = await Subscription.findAll({ where: { ...offline, status: S.PAST_DUE }, include: [clientInclude], transaction });
    for (const subscription of late) {
      const suspendAt = new Date(subscription.currentPeriodEnd).getTime() + graceDays * DAY;
      if (suspendAt > now.getTime()) continue;
      await move(
        subscription,
        S.SUSPENDED,
        {},
        'subscription.suspended',
        `${subscription.client.name} was suspended after the grace period (offline)`,
        transaction,
      );
      summary.suspended += 1;
    }

    // 3. suspension days after that
    if (suspensionDays > 0) {
      const suspended = await Subscription.findAll({ where: { ...offline, status: S.SUSPENDED }, include: [clientInclude], transaction });
      for (const subscription of suspended) {
        const expireAt = new Date(subscription.currentPeriodEnd).getTime() + (graceDays + suspensionDays) * DAY;
        if (expireAt > now.getTime()) continue;
        await move(
          subscription,
          S.EXPIRED,
          { endedAt: now },
          'subscription.expired',
          `The subscription of ${subscription.client.name} expired after the suspension period (offline)`,
          transaction,
        );
        summary.expired += 1;
      }
    }

    return summary;
  });

const start = () => {
  const tick = () => runOnce().catch((error) => logger.error(`Subscription expiry job failed: ${error.message}`));
  setImmediate(tick);
  setInterval(tick, HOUR).unref();
};

module.exports = { runOnce, start };
