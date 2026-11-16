// Demo data for local development: one school with an active subscription and a login for every role, so the web
// app (bubbly-web) can be tried end to end without going through payment.
//
//   npm run seed:demo
//
// Safe to run again: anything that already exists (matched by email, slug or name) is left as it is.
// Refuses to run when NODE_ENV is production. Passwords are fixed and printed at the end: development only.
require('dotenv').config({ quiet: true });
require('module-alias/register');

if ((process.env.NODE_ENV || 'development') === 'production') {
  console.error('database/demo.js refuses to run in production.');
  process.exit(1);
}

const context = require('../app/Helpers/context');
const password = require('../app/Helpers/password');
const { sequelize } = require('../app/Helpers/database');
const {
  AppModule,
  Plan,
  PlanLimit,
  PlanModule,
  Client,
  Subscription,
  User,
  TeacherProfile,
  SchoolClass,
  Student,
} = require('../app/Models');
const { USER_ROLE, USER_STATUS, SUBSCRIPTION_STATUS, BILLING_SOURCE, PLAN_STATUS, CLIENT_STATUS, NO } = require('../app/Helpers/constants');

const SCHOOL = { name: 'Bubbly Demo Preschool', slug: 'bubbly-demo-preschool' };
const LOGINS = {
  principal: { email: 'principal@demo.bubbly.local', password: 'Principal@123', name: 'Brij Patel', phone: '+919825012345' },
  teachers: [
    { email: 'neha@demo.bubbly.local', name: 'Neha Verma', phone: '+919428012345', qualification: 'Pre-primary Teacher Training (PPTT)', className: 'Playgroup' },
    { email: 'priya@demo.bubbly.local', name: 'Priya Sharma', phone: '+919876543210', qualification: 'M.A. Child Psychology & ECCEd', className: 'Nursery' },
    { email: 'ananya@demo.bubbly.local', name: 'Ananya Gupta', phone: '+919123456789', qualification: 'Diploma in Montessori Teaching', className: 'Jr KG' },
    { email: 'pallavi@demo.bubbly.local', name: 'Pallavi Dave', phone: '+919685775896', qualification: 'B.Ed in Early Childhood Education', className: 'Sr KG' },
  ],
  teacherPassword: 'Teacher@123',
  parent: { email: 'parent@demo.bubbly.local', password: 'Parent@123' },
};
const CLASSES = [
  { name: 'Playgroup', code: 'PG-A', room: 'Room 101', startsAt: '09:00', endsAt: '12:00' },
  { name: 'Nursery', code: 'NUR-A', room: 'Room 102', startsAt: '08:45', endsAt: '12:30' },
  { name: 'Jr KG', code: 'JKG-A', room: 'Room 103', startsAt: '08:30', endsAt: '13:00' },
  { name: 'Sr KG', code: 'SKG-A', room: 'Room 104', startsAt: '08:30', endsAt: '13:30' },
];
const STUDENTS = [
  ['Aditya Dave', 'Playgroup', 'Pallavi Dave', '2022-05-14', 'B+', '+919685775896'],
  ['Kiara Mehta', 'Playgroup', 'Rohan Mehta', '2021-11-02', 'O+', '+919876500010'],
  ['Aarav Singhania', 'Playgroup', 'Vikram Singhania', '2022-08-28', 'A+', '+919822001122'],
  ['Reyansh Shah', 'Nursery', 'Sneha Shah', '2021-03-12', 'O+', '+919898011223'],
  ['Myra Joshi', 'Nursery', 'Kavita Joshi', '2021-07-22', 'A+', '+919812300011'],
  ['Vihaan Rao', 'Jr KG', 'Suresh Rao', '2020-09-09', 'B-', '+919845600022'],
  ['Saanvi Iyer', 'Jr KG', 'Lakshmi Iyer', '2020-12-01', 'AB+', '+919845600033'],
  ['Arjun Nair', 'Sr KG', 'Deepa Nair', '2019-10-15', 'O-', '+919845600044'],
];

const log = (message) => console.log(`  ${message}`);

const ensurePlan = async () => {
  let plan = await Plan.findOne({ where: { slug: 'demo-growth' } });
  if (!plan) {
    plan = await Plan.create({
      name: 'Demo Growth Plan',
      slug: 'demo-growth',
      description: 'Every module, for local testing',
      pricePaise: 99900,
      billingInterval: 3,
      status: PLAN_STATUS.PUBLISHED,
      publishedAt: new Date(),
    });
    for (const [limitKey, limitValue] of Object.entries({ max_students: 600, max_teachers: 25, max_classes: 20, storage_mb: 20480 })) {
      await PlanLimit.create({ planId: plan.id, limitKey, limitValue });
    }
    log('plan "Demo Growth Plan" created');
  }
  const modules = await AppModule.findAll();
  for (const module of modules) {
    const linked = await PlanModule.findOne({ where: { planId: plan.id, moduleId: module.id } });
    if (!linked) await PlanModule.create({ planId: plan.id, moduleId: module.id, included: 1 });
  }
  return plan;
};

const ensureSchool = async (plan) => {
  let client = await Client.findOne({ where: { slug: SCHOOL.slug } });
  if (!client) {
    client = await Client.create({
      ...SCHOOL,
      status: CLIENT_STATUS.ACTIVE,
      contactName: LOGINS.principal.name,
      contactEmail: LOGINS.principal.email,
      contactPhone: LOGINS.principal.phone,
      city: 'Ahmedabad',
      state: 'Gujarat',
      country: 'India',
      timezone: 'Asia/Kolkata',
      opensAt: '08:30',
      closesAt: '14:00',
    });
    log(`school "${SCHOOL.name}" created`);
  }

  const active = await Subscription.findOne({ where: { clientId: client.id, status: SUBSCRIPTION_STATUS.ACTIVE } });
  if (!active) {
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

// a login with a known password (inside the school's context)
const ensureLogin = async ({ email, name, phone, role, plain }) => {
  const existing = await context.runWithoutTenant('demo seed: is this demo email taken', () => User.findOne({ where: { email } }));
  if (existing) return existing;
  return User.create({
    email,
    name,
    phone,
    role,
    status: USER_STATUS.ACTIVE,
    mustChangePassword: NO,
    passwordHash: await password.hash(plain),
    passwordChangedAt: new Date(),
  });
};

const run = async () => {
  const plan = await ensurePlan();
  const client = await ensureSchool(plan);

  await context.run(client.id, async () => {
    const p = LOGINS.principal;
    await ensureLogin({ email: p.email, name: p.name, phone: p.phone, role: USER_ROLE.PRINCIPAL, plain: p.password });

    const teacherByClass = {};
    for (const t of LOGINS.teachers) {
      const user = await ensureLogin({ email: t.email, name: t.name, phone: t.phone, role: USER_ROLE.TEACHER, plain: LOGINS.teacherPassword });
      if (!(await TeacherProfile.findOne({ where: { userId: user.id } }))) {
        await TeacherProfile.create({
          userId: user.id,
          designation: 'Teacher',
          qualification: t.qualification,
          experienceYears: 3,
          joiningDate: '2024-06-01',
          shiftStartsAt: '08:30',
          shiftEndsAt: '13:30',
          annualLeaveQuota: 12,
        });
      }
      teacherByClass[t.className] = user;
    }

    const classByName = {};
    for (const [index, c] of CLASSES.entries()) {
      let row = await SchoolClass.findOne({ where: { name: c.name } });
      if (!row) row = await SchoolClass.create({ ...c, capacity: 30, sortOrder: (index + 1) * 10, classTeacherId: teacherByClass[c.name].id });
      classByName[c.name] = row;
    }

    for (const [name, className, guardianName, dateOfBirth, bloodGroup, guardianPhone] of STUDENTS) {
      if (await Student.findOne({ where: { name } })) continue;
      await Student.create({
        name,
        classId: classByName[className].id,
        guardianName,
        guardianRelation: 'Parent',
        guardianPhone,
        dateOfBirth,
        bloodGroup,
        admissionDate: '2026-06-10',
      });
    }

    // the first student gets the demo parent login
    const first = await Student.findOne({ where: { name: STUDENTS[0][0] } });
    if (!first.userId) {
      const parent = await ensureLogin({
        email: LOGINS.parent.email,
        name: first.guardianName,
        phone: first.guardianPhone,
        role: USER_ROLE.STUDENT,
        plain: LOGINS.parent.password,
      });
      await first.update({ userId: parent.id, guardianEmail: LOGINS.parent.email });
    }
  });

  console.log('\nDemo logins (bubbly-web, http://localhost:3001/login):');
  console.log(`  Principal  ${LOGINS.principal.email}  /  ${LOGINS.principal.password}`);
  console.log(`  Teacher    ${LOGINS.teachers[0].email}  /  ${LOGINS.teacherPassword}  (also priya@, ananya@, pallavi@)`);
  console.log(`  Parent     ${LOGINS.parent.email}  /  ${LOGINS.parent.password}  (child: ${STUDENTS[0][0]})`);
};

run()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error(err);
    await sequelize.close();
    process.exit(1);
  });
