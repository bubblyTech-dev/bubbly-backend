// One test school with an active subscription and a Principal login, so the web app can be tried on any server
// (including a live one) without going through payment.
//
//   SEED_TEST_EMAIL=you@example.com SEED_TEST_PASSWORD='Choose-a-password1' npm run seed:test-school
//
// - The email and password come from the environment only: nothing secret is stored in the repo.
// - Safe to run again: anything that already exists (matched by slug, plan slug or email) is left as it is.
// - The test plan is a Draft, so it never shows on the public plans page.
// - To remove the test school later, suspend or delete it from the Admin app.
require('dotenv').config({ quiet: true });
require('module-alias/register');

const email = String(process.env.SEED_TEST_EMAIL || '').trim().toLowerCase();
const plain = process.env.SEED_TEST_PASSWORD || '';
const SCHOOL_NAME = process.env.SEED_TEST_SCHOOL_NAME || 'Bubbly Test School';

if (!email || !plain) {
  console.error('Set SEED_TEST_EMAIL and SEED_TEST_PASSWORD (8+ characters, a letter and a number) and run again.');
  process.exit(1);
}
if (!require('../app/Rules/password').test(plain)) {
  console.error('SEED_TEST_PASSWORD must be 8 to 128 characters and include a letter and a number.');
  process.exit(1);
}

const context = require('../app/Helpers/context');
const password = require('../app/Helpers/password');
const { sequelize } = require('../app/Helpers/database');
const { AppModule, Plan, PlanLimit, PlanModule, Client, Subscription, User } = require('../app/Models');
const { USER_ROLE, USER_STATUS, SUBSCRIPTION_STATUS, BILLING_SOURCE, PLAN_STATUS, CLIENT_STATUS, NO } = require('../app/Helpers/constants');

const SLUG = 'bubbly-test-school';
const PLAN_SLUG = 'test-plan';

const log = (message) => console.log(`  ${message}`);

const ensurePlan = async () => {
  let plan = await Plan.findOne({ where: { slug: PLAN_SLUG } });
  if (!plan) {
    plan = await Plan.create({
      name: 'Test Plan',
      slug: PLAN_SLUG,
      description: 'Every module, for testing (not public)',
      pricePaise: 0,
      billingInterval: 3,
      status: PLAN_STATUS.DRAFT,
    });
    for (const [limitKey, limitValue] of Object.entries({ max_students: 100, max_teachers: 10, max_classes: 10, storage_mb: 1024 })) {
      await PlanLimit.create({ planId: plan.id, limitKey, limitValue });
    }
    log('plan "Test Plan" created (draft, not public)');
  }
  for (const module of await AppModule.findAll()) {
    if (!(await PlanModule.findOne({ where: { planId: plan.id, moduleId: module.id } }))) {
      await PlanModule.create({ planId: plan.id, moduleId: module.id, included: 1 });
    }
  }
  return plan;
};

const ensureSchool = async (plan) => {
  let client = await Client.findOne({ where: { slug: SLUG } });
  if (!client) {
    client = await Client.create({
      name: SCHOOL_NAME,
      slug: SLUG,
      status: CLIENT_STATUS.ACTIVE,
      contactName: 'Test Principal',
      contactEmail: email,
      country: 'India',
      timezone: 'Asia/Kolkata',
      opensAt: '08:30',
      closesAt: '14:00',
    });
    log(`school "${SCHOOL_NAME}" created`);
  }

  if (!(await Subscription.findOne({ where: { clientId: client.id, status: SUBSCRIPTION_STATUS.ACTIVE } }))) {
    const now = new Date();
    await Subscription.create({
      clientId: client.id,
      planId: plan.id,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      source: BILLING_SOURCE.OFFLINE,
      billingInterval: plan.billingInterval,
      amountPaise: plan.pricePaise,
      startedAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 365 * 86400000),
    });
    log('active subscription created (offline, one year)');
  }
  return client;
};

const run = async () => {
  const taken = await context.runWithoutTenant('test seed: is this email taken', () => User.findOne({ where: { email } }));
  const client = await ensureSchool(await ensurePlan());

  await context.run(client.id, async () => {
    if (taken) {
      if (taken.clientId !== client.id) throw new Error(`${email} already belongs to another school user. Use a different SEED_TEST_EMAIL.`);
      return log('Principal login already exists (password left as it is)');
    }
    await User.create({
      email,
      name: 'Test Principal',
      role: USER_ROLE.PRINCIPAL,
      status: USER_STATUS.ACTIVE,
      mustChangePassword: NO,
      passwordHash: await password.hash(plain),
      passwordChangedAt: new Date(),
    });
    log('Principal login created');
  });

  console.log(`\nTest school ready. Web login: ${email}  (the password you set in SEED_TEST_PASSWORD)`);
};

run()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error(err.message || err);
    await sequelize.close();
    process.exit(1);
  });
