const crypto = require('crypto');
const { Op } = require('sequelize');
const payment = require('@config/payment');
const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const { paginationParams } = require('@app/Helpers/pagination');
const { findOrFail, isUuid } = require('@app/Helpers/ref');
const { sequelize } = require('@app/Helpers/database');
const { BILLING_SOURCE, CLIENT_STATUS, PLAN_STATUS, SUBSCRIPTION_STATUS, YES, NO } = require('@app/Helpers/constants');
const { Client, Plan, Subscription } = require('@app/Models');
const SubscriptionResource = require('@app/Resources/V1/Admin/SubscriptionResource');
const Settings = require('@app/Helpers/settings');
const Tax = require('@app/Helpers/tax');
const Razorpay = require('@app/Services/V1/Common/PaymentGateway/RazorpayService');
const GatewaySyncService = require('./GatewaySyncService');

// Subscriptions of schools, created through Razorpay. `ctx` is { admin, ip, userAgent }.
//
// A subscription is created as Pending and is NEVER marked Active here: activation comes from the verified Razorpay
// webhook (built later). Until then `sync` can refresh a subscription from Razorpay by hand.
// Cancelling always stops the subscription at the end of the billing period.

const S = SUBSCRIPTION_STATUS;

// what Razorpay calls the state -> our status
const STATUS_FROM_RAZORPAY = {
  created: S.PENDING,
  authenticated: S.PENDING,
  active: S.ACTIVE,
  pending: S.PAST_DUE,
  halted: S.SUSPENDED,
  cancelled: S.CANCELLED,
  completed: S.EXPIRED,
  expired: S.EXPIRED,
  paused: S.SUSPENDED,
};

// a school may have only one of these at a time
const OPEN_STATUSES = [S.PENDING, S.ACTIVE, S.PAST_DUE];

const withRelations = [
  { model: Client, as: 'client', attributes: ['id', 'uuid', 'name'] },
  { model: Plan, as: 'plan', attributes: ['id', 'uuid', 'name', 'version'] },
];

const fromUnix = (seconds) => (seconds ? new Date(Number(seconds) * 1000) : null);

// the columns that mirror a Razorpay subscription object
const fieldsFromRazorpay = (remote) => ({
  razorpaySubscriptionId: remote.id,
  razorpayPlanId: remote.plan_id,
  razorpayCustomerId: remote.customer_id || null,
  status: STATUS_FROM_RAZORPAY[remote.status] ?? S.PENDING,
  totalCount: remote.total_count,
  paidCount: remote.paid_count ?? 0,
  remainingCount: remote.remaining_count ?? null,
  startedAt: fromUnix(remote.start_at),
  currentPeriodStart: fromUnix(remote.current_start),
  currentPeriodEnd: fromUnix(remote.current_end),
  nextChargeAt: fromUnix(remote.charge_at),
  endedAt: fromUnix(remote.ended_at),
  shortUrl: remote.short_url || null,
  gatewayData: remote,
});

// only safe fields go into the audit log
const snapshot = (subscription) => ({
  status: Number(subscription.status),
  razorpaySubscriptionId: subscription.razorpaySubscriptionId,
  razorpayPlanId: subscription.razorpayPlanId,
  amountPaise: Number(subscription.amountPaise),
  billingInterval: Number(subscription.billingInterval),
  cancelAtCycleEnd: Number(subscription.cancelAtCycleEnd),
});

const loadOne = (uuid, options = {}) => findOrFail(Subscription, uuid, { include: withRelations, ...options });

const escapeLike = (text) => text.replace(/[\\%_]/g, '\\$&');

const list = async (query) => {
  const { page, perPage, limit, offset } = paginationParams(query);
  const where = {};

  if (query.status) where.status = Number(query.status);
  if (query.plan && isUuid(query.plan)) where['$plan.uuid$'] = query.plan;

  if (query.search) {
    const pattern = `%${escapeLike(query.search)}%`;
    where[Op.or] = [
      { '$client.name$': { [Op.iLike]: pattern } },
      { razorpaySubscriptionId: { [Op.iLike]: pattern } },
    ];
  }

  const { rows, count } = await Subscription.findAndCountAll({
    where,
    include: withRelations,
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });
  return SubscriptionResource.paginate({ rows, count, page, perPage });
};

// all subscriptions of one school, newest first (the school detail tab)
const listForSchool = async (clientUuid) => {
  const client = await findOrFail(Client, clientUuid);
  const rows = await Subscription.findAll({
    where: { clientId: client.id },
    include: withRelations,
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
  });
  return SubscriptionResource.collection(rows);
};

const show = async (uuid) => SubscriptionResource.make(await loadOne(uuid));

// startAt (optional) must be a time Razorpay accepts: in the future
const parseStartAt = (startAt) => {
  if (!startAt) return null;
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now() + 60000) {
    throw AppError.validation({ startAt: ['The start time must be in the future.'] });
  }
  return date;
};

const create = async ({ client, plan, startAt, ctx }) => {
  if (Number(client.status) !== CLIENT_STATUS.ACTIVE) {
    throw AppError.validation({ client: ['Only an active school can get a subscription.'] });
  }
  if (Number(plan.status) !== PLAN_STATUS.PUBLISHED) {
    throw AppError.validation({ planUuid: ['Choose a published plan.'] });
  }
  if (!plan.razorpayPlanId) {
    throw AppError.validation({ planUuid: ['This plan is not on Razorpay yet. Sync it to Razorpay first.'] });
  }

  const open = await Subscription.findOne({ where: { clientId: client.id, status: OPEN_STATUSES }, attributes: ['id'] });
  if (open) throw AppError.validation({ client: ['This school already has a subscription that is not finished.'] });

  const start = parseStartAt(startAt);
  const uuid = crypto.randomUUID();

  // Razorpay first: if it refuses, nothing is saved on our side
  const customerId = await GatewaySyncService.ensureCustomer(client);
  const remote = await Razorpay.createSubscription({
    planId: plan.razorpayPlanId,
    customerId,
    totalCount: payment.totalCounts[Number(plan.billingInterval)],
    startAt: start,
    customerNotify: true,
    notes: { subscription_uuid: uuid, client_uuid: client.uuid, plan_uuid: plan.uuid },
  });

  try {
    const created = await sequelize.transaction(async (transaction) => {
      const row = await Subscription.create(
        {
          uuid,
          clientId: client.id,
          planId: plan.id,
          ...fieldsFromRazorpay(remote),
          status: S.PENDING, // never Active from here, whatever Razorpay says
          billingInterval: plan.billingInterval,
          // what the school is charged each period (price + GST for a plan that is not tax inclusive)
          amountPaise: Tax.chargeAmountPaise(plan, await Settings.get('billing.gst_rate_percent')),
          currency: plan.currency,
          cancelAtCycleEnd: NO,
          createdBy: ctx.admin.id,
        },
        { transaction },
      );

      await Audit.log(
        ctx,
        'subscription.created',
        {
          entityType: 'subscription',
          entityUuid: row.uuid,
          clientId: client.id,
          description: `Created a subscription to "${plan.name}" for ${client.name}`,
          after: snapshot(row),
        },
        { transaction },
      );
      return row;
    });

    return SubscriptionResource.make(await loadOne(created.uuid));
  } catch (error) {
    // our save failed after Razorpay accepted it: remove the orphan so it cannot be paid for by mistake
    await Razorpay.cancelSubscription(remote.id, { atCycleEnd: false }).catch(() => {});
    throw error;
  }
};

// POST /schools/:uuid/subscriptions
const createForSchool = async (clientUuid, { planUuid, startAt }, ctx) => {
  const client = await findOrFail(Client, clientUuid);
  const plan = await findOrFail(Plan, planUuid);
  return create({ client, plan, startAt, ctx });
};

// Cancel at the end of the current billing period (the only way a school's subscription is stopped).
// A subscription that never started has no period to wait for and Razorpay refuses "end of period" for it, so it is
// cancelled at once. We never mark a subscription Cancelled on our side while Razorpay may still charge it: if Razorpay
// refuses and the subscription is still live there, the error is shown instead.
// An offline subscription has no Razorpay side: it is set to end when its paid period ends (the expiry job then
// cancels it), so the school keeps what it paid for.
const cancelOffline = async (subscription, before, ctx) => {
  await sequelize.transaction(async (transaction) => {
    await subscription.update({ cancelAtCycleEnd: YES, cancelRequestedAt: new Date() }, { transaction });

    await Audit.log(
      ctx,
      'subscription.cancel_requested',
      {
        entityType: 'subscription',
        entityUuid: subscription.uuid,
        clientId: subscription.clientId,
        description: `Set the offline subscription of ${subscription.client.name} to end after the current period`,
        before,
        after: snapshot(subscription),
      },
      { transaction },
    );
  });
};

const cancel = async (uuid, ctx) => {
  const subscription = await loadOne(uuid);
  const before = snapshot(subscription);

  if ([S.CANCELLED, S.EXPIRED].includes(Number(subscription.status))) {
    throw AppError.validation({ subscription: ['This subscription has already ended.'] });
  }
  if (Number(subscription.cancelAtCycleEnd) === YES) {
    throw AppError.validation({ subscription: ['This subscription is already set to end after the current period.'] });
  }

  if (Number(subscription.source) === BILLING_SOURCE.OFFLINE) {
    await cancelOffline(subscription, before, ctx);
    return SubscriptionResource.make(await loadOne(uuid));
  }

  const neverStarted = Number(subscription.status) === S.PENDING && Number(subscription.paidCount) === 0;

  let remote;
  try {
    remote = await Razorpay.cancelSubscription(subscription.razorpaySubscriptionId, { atCycleEnd: !neverStarted });
  } catch (error) {
    // already ended on Razorpay's side: bring ours up to date instead of failing
    const live = await Razorpay.fetchSubscription(subscription.razorpaySubscriptionId).catch(() => null);
    if (!live || !['cancelled', 'completed', 'expired'].includes(live.status)) throw error;
    remote = live;
  }

  await sequelize.transaction(async (transaction) => {
    const changes = { ...fieldsFromRazorpay(remote), cancelRequestedAt: new Date() };
    const cancelledNow = STATUS_FROM_RAZORPAY[remote.status] === S.CANCELLED;

    if (cancelledNow) {
      changes.cancelledAt = new Date();
      changes.cancelAtCycleEnd = NO;
    } else {
      changes.cancelAtCycleEnd = YES;
    }

    await subscription.update(changes, { transaction });

    await Audit.log(
      ctx,
      cancelledNow ? 'subscription.cancelled' : 'subscription.cancel_requested',
      {
        entityType: 'subscription',
        entityUuid: subscription.uuid,
        clientId: subscription.clientId,
        description: cancelledNow
          ? `Cancelled the subscription of ${subscription.client.name} (it had not started yet)`
          : `Set the subscription of ${subscription.client.name} to end after the current period`,
        before,
        after: snapshot(subscription),
      },
      { transaction },
    );
  });

  return SubscriptionResource.make(await loadOne(uuid));
};

// Refreshes one subscription from Razorpay (a manual helper until the webhook exists).
const sync = async (uuid, ctx) => {
  const subscription = await loadOne(uuid);
  const before = snapshot(subscription);

  if (Number(subscription.source) === BILLING_SOURCE.OFFLINE) {
    throw AppError.validation({ subscription: ['An offline subscription is not on Razorpay, so there is nothing to refresh.'] });
  }

  const remote = await Razorpay.fetchSubscription(subscription.razorpaySubscriptionId);

  await sequelize.transaction(async (transaction) => {
    const changes = fieldsFromRazorpay(remote);

    // Razorpay marks "stop after this period" as a scheduled change
    if (remote.has_scheduled_changes && STATUS_FROM_RAZORPAY[remote.status] === S.ACTIVE) changes.cancelAtCycleEnd = YES;
    if (STATUS_FROM_RAZORPAY[remote.status] === S.CANCELLED && !subscription.cancelledAt) changes.cancelledAt = new Date();

    await subscription.update(changes, { transaction });

    await Audit.log(
      ctx,
      'subscription.synced',
      {
        entityType: 'subscription',
        entityUuid: subscription.uuid,
        clientId: subscription.clientId,
        description: `Refreshed the subscription of ${subscription.client.name} from Razorpay`,
        before,
        after: snapshot(subscription),
      },
      { transaction },
    );
  });

  return SubscriptionResource.make(await loadOne(uuid));
};

module.exports = { list, listForSchool, show, create, createForSchool, cancel, sync, STATUS_FROM_RAZORPAY, fieldsFromRazorpay };
