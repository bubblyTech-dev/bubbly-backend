const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const { sequelize } = require('@app/Helpers/database');
const { findOrFail } = require('@app/Helpers/ref');
const { Client, Plan } = require('@app/Models');
const { PLAN_STATUS } = require('@app/Helpers/constants');
const Razorpay = require('@app/Services/V1/Common/PaymentGateway/RazorpayService');

// Keeps our rows and Razorpay in step: plans (created once, Razorpay plans cannot be edited) and schools as customers.
// Every Razorpay id is stored in our own table. `ctx` is { admin, ip, userAgent }.

// Creates the plan on Razorpay unless it already has an id. Never creates a second one.
// Returns the plan row. Razorpay is called first; if it fails nothing is saved.
const syncPlan = async (plan, ctx) => {
  if (plan.razorpayPlanId) return plan;

  const remote = await Razorpay.createPlan({
    name: plan.name,
    description: plan.description || undefined,
    amountPaise: plan.pricePaise,
    currency: plan.currency,
    billingInterval: plan.billingInterval,
    notes: { plan_uuid: plan.uuid, plan_version: String(plan.version) },
  });

  await sequelize.transaction(async (transaction) => {
    await plan.update({ razorpayPlanId: remote.id, razorpaySyncedAt: new Date() }, { transaction });
    await Audit.log(
      ctx,
      'plan.gateway_synced',
      {
        entityType: 'plan',
        entityUuid: plan.uuid,
        description: `Created plan "${plan.name}" on Razorpay`,
        after: { razorpayPlanId: remote.id },
      },
      { transaction },
    );
  });

  return plan;
};

// POST /admin/plans/:uuid/sync-gateway: retry, or sync a plan that was published before the keys were added
const syncPlanByUuid = async (uuid, ctx) => {
  const plan = await findOrFail(Plan, uuid);

  if (Number(plan.status) !== PLAN_STATUS.PUBLISHED) {
    throw AppError.validation({ plan: ['Only a published plan is created on Razorpay.'] });
  }
  if (!Razorpay.isConfigured()) {
    throw new AppError(503, 'The payment gateway is not set up yet.', { code: 'PAYMENT_GATEWAY_NOT_CONFIGURED' });
  }

  await syncPlan(plan, ctx);
  return plan;
};

// The school as a Razorpay customer. Created once; the id is stored on the school.
const ensureCustomer = async (client) => {
  if (client.razorpayCustomerId) return client.razorpayCustomerId;

  if (!client.contactEmail) {
    throw AppError.validation({ client: ['Add a contact email to the school before creating a subscription.'] });
  }

  const remote = await Razorpay.createCustomer({
    name: client.contactName || client.name,
    email: client.contactEmail,
    contact: client.contactPhone || undefined,
    notes: { client_uuid: client.uuid, school: client.name },
  });

  await Client.update({ razorpayCustomerId: remote.id }, { where: { id: client.id } });
  client.razorpayCustomerId = remote.id;
  return remote.id;
};

module.exports = { syncPlan, syncPlanByUuid, ensureCustomer };
