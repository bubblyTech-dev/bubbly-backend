const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const Settings = require('@app/Helpers/settings');
const { findOrFail } = require('@app/Helpers/ref');
const { sequelize } = require('@app/Helpers/database');
const {
  BILLING_SOURCE,
  CLIENT_STATUS,
  PAYMENT_STATUS,
  PLAN_STATUS,
  SUBSCRIPTION_STATUS,
  YES,
  NO,
} = require('@app/Helpers/constants');
const { Client, Plan, Subscription, Payment } = require('@app/Models');
const InvoiceIssuer = require('@app/Services/V1/Common/Webhooks/InvoiceIssuer');
const Provisioning = require('@app/Services/V1/Common/Provisioning');
const BillingQueryService = require('./BillingQueryService');
const SubscriptionService = require('./SubscriptionService');

// A school that pays outside Razorpay (bank transfer, cash, cheque, UPI). Staff record the money and decide how long
// the school may use the product ("valid until"). `ctx` is { admin, ip, userAgent }.
//
// An offline school has its own subscription row (source Offline, no Razorpay ids). It stays Active until the chosen
// date; then SubscriptionExpiryJob moves it to Past due, Suspended and Expired using the grace settings.

const S = SUBSCRIPTION_STATUS;
const DEFAULT_METHODS = ['Cash', 'Bank transfer', 'Cheque', 'UPI'];

// a Razorpay subscription that is still open for this school means the school should keep paying through Razorpay
const OPEN_STATUSES = [S.PENDING, S.ACTIVE, S.PAST_DUE];
// statuses of an offline subscription that a new payment can renew (a cancelled or expired one starts a new row)
const RENEWABLE = [S.PENDING, S.ACTIVE, S.PAST_DUE, S.SUSPENDED];

// ---- dates: staff think in calendar days in India ----
const IST = '+05:30';
const todayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const noonOf = (day) => new Date(`${day}T12:00:00${IST}`);
const endOfDay = (day) => new Date(`${day}T23:59:59.999${IST}`);

const configuredMethods = async () => {
  try {
    const value = await Settings.get('billing.offline_payment_methods');
    const list = Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
    return list.length ? list : DEFAULT_METHODS;
  } catch (error) {
    // the setting is not defined (yet): use the built-in list
    return DEFAULT_METHODS;
  }
};

const options = async () => ({ methods: await configuredMethods() });

const lock = (key, transaction) =>
  sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key }, transaction });

const check = (condition, field, message) => {
  if (!condition) throw AppError.validation({ [field]: [message] });
};

const snapshot = (subscription) => ({
  status: Number(subscription.status),
  planId: subscription.planId,
  amountPaise: Number(subscription.amountPaise),
  paidCount: subscription.paidCount,
  currentPeriodStart: subscription.currentPeriodStart,
  currentPeriodEnd: subscription.currentPeriodEnd,
  cancelAtCycleEnd: Number(subscription.cancelAtCycleEnd),
});

// POST /payments/offline
const record = async (ctx, data) => {
  const amount = Number(data.amountPaise);
  const today = todayIst();
  const methods = await configuredMethods();

  check(Number.isInteger(amount) && amount >= 0, 'amountPaise', 'The amount must be a whole number of paise, zero or more.');
  check(methods.includes(data.method), 'method', 'Choose one of the payment methods from the list.');
  check(data.paidAt <= today, 'paidAt', 'The payment date cannot be in the future.');
  check(data.validUntil > data.paidAt, 'validUntil', 'The valid-until date must be after the payment date.');
  check(data.validUntil >= today, 'validUntil', 'The valid-until date cannot be in the past.');

  const client = await findOrFail(Client, data.schoolUuid);
  const plan = await findOrFail(Plan, data.planUuid);
  check(Number(client.status) === CLIENT_STATUS.ACTIVE, 'schoolUuid', 'Only an active school can be given a payment.');
  check(Number(plan.status) === PLAN_STATUS.PUBLISHED, 'planUuid', 'Choose a published plan.');

  const paidAt = noonOf(data.paidAt);
  const validUntil = endOfDay(data.validUntil);

  const saved = await sequelize.transaction(async (transaction) => {
    await lock(`offline-subscription:${client.id}`, transaction);

    const razorpayOpen = await Subscription.findOne({
      where: { clientId: client.id, source: BILLING_SOURCE.RAZORPAY, status: OPEN_STATUSES },
      attributes: ['id'],
      transaction,
    });
    check(!razorpayOpen, 'schoolUuid', 'This school already has a Razorpay subscription. Its payments come through Razorpay.');

    const existing = await Subscription.findOne({
      where: { clientId: client.id, source: BILLING_SOURCE.OFFLINE, status: RENEWABLE },
      order: [['id', 'DESC']],
      transaction,
    });

    const before = existing ? snapshot(existing) : null;
    const periodFields = {
      status: S.ACTIVE,
      planId: plan.id,
      billingInterval: plan.billingInterval,
      amountPaise: amount,
      currency: plan.currency,
      currentPeriodStart: paidAt,
      currentPeriodEnd: validUntil,
      nextChargeAt: null,
      cancelAtCycleEnd: NO,
      cancelRequestedAt: null,
    };

    let subscription;
    if (existing) {
      await existing.update({ ...periodFields, paidCount: (Number(existing.paidCount) || 0) + 1 }, { transaction });
      subscription = existing;
    } else {
      subscription = await Subscription.create(
        {
          clientId: client.id,
          source: BILLING_SOURCE.OFFLINE,
          ...periodFields,
          paidCount: 1,
          startedAt: paidAt,
          createdBy: ctx.admin.id,
        },
        { transaction },
      );
    }

    const payment = await Payment.create(
      {
        clientId: client.id,
        subscriptionId: subscription.id,
        source: BILLING_SOURCE.OFFLINE,
        status: PAYMENT_STATUS.CAPTURED,
        method: data.method,
        amountPaise: amount,
        currency: plan.currency,
        paidAt,
        recordedBy: ctx.admin.id,
        reference: data.reference || null,
        notes: data.notes || null,
      },
      { transaction },
    );

    // the same gapless numbering and GST split as an online payment
    const invoice = await InvoiceIssuer.issueForPayment({ subscription, payment, transaction });

    // makes the school usable and sends the Principal's welcome link (idempotent, a failure there is audited only)
    await Provisioning.onSubscriptionActivated(subscription, client, { transaction });

    await Audit.log(
      ctx,
      'payment.recorded_offline',
      {
        entityType: 'payment',
        entityUuid: payment.uuid,
        clientId: client.id,
        description: `Recorded an offline payment of ${(amount / 100).toFixed(2)} from ${client.name}, valid until ${data.validUntil}`,
        before,
        after: { ...snapshot(subscription), method: data.method, reference: data.reference || null, invoiceNo: invoice ? invoice.invoiceNo : null },
      },
      { transaction },
    );

    return { payment, invoice, subscription };
  });

  return {
    payment: await BillingQueryService.showPayment(saved.payment.uuid),
    invoice: saved.invoice ? await BillingQueryService.showInvoice(saved.invoice.uuid) : null,
    subscription: await SubscriptionService.show(saved.subscription.uuid),
  };
};

// POST /subscriptions/:uuid/expiry
const changeExpiry = async (uuid, { validUntil }, ctx) => {
  const subscription = await findOrFail(Subscription, uuid, { include: [{ model: Client, as: 'client', attributes: ['id', 'uuid', 'name'] }] });

  check(
    Number(subscription.source) === BILLING_SOURCE.OFFLINE,
    'subscription',
    'Only an offline subscription has an expiry date you can change. A Razorpay subscription follows its billing period.',
  );
  check(![S.CANCELLED, S.EXPIRED].includes(Number(subscription.status)), 'subscription', 'This subscription has already ended.');
  check(validUntil >= todayIst(), 'validUntil', 'The valid-until date cannot be in the past.');

  const end = endOfDay(validUntil);
  check(!subscription.currentPeriodStart || end > subscription.currentPeriodStart, 'validUntil', 'The valid-until date must be after the start of the current period.');

  await sequelize.transaction(async (transaction) => {
    await lock(`offline-subscription:${subscription.clientId}`, transaction);
    await subscription.reload({ transaction });

    const before = snapshot(subscription);
    const changes = { currentPeriodEnd: end };
    // a later date gives a late or suspended school its access back
    if ([S.PAST_DUE, S.SUSPENDED].includes(Number(subscription.status)) && end > new Date()) changes.status = S.ACTIVE;

    await subscription.update(changes, { transaction });

    await Audit.log(
      ctx,
      'subscription.expiry_changed',
      {
        entityType: 'subscription',
        entityUuid: subscription.uuid,
        clientId: subscription.clientId,
        description: `Changed the expiry date of ${subscription.client.name} to ${validUntil}`,
        before,
        after: snapshot(subscription),
      },
      { transaction },
    );
  });

  return SubscriptionService.show(uuid);
};

module.exports = { options, record, changeExpiry };
