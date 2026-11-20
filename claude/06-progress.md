# 06. Progress

_Update this file whenever something is finished, started or decided._

## Done
- **School workspace, Phase A** (backend + bubbly-web): classes, students (with the parent app login), teachers (login + `teacher_profiles`), staff attendance, school settings, own profile, Principal dashboard; web login, refresh, forgot/reset/change password, role-based routing and the Principal screens wired to the API. Migrations `20261115000100` to `000113` (run). See "School workspace API" in `04-conventions.md`. Next: Phase B (student attendance, leave, homework, timetable, calendar, announcements), then Phase C (fees, admission inquiries, real-time chat with Socket.IO, notifications, reports)
- Main Dashboard (backend + Admin app): `GET /admin/dashboard` with live KPIs (schools, subscriptions, MRR/ARR, revenue without GST with GST and refunds, renewals due, past due, inquiries), 12-month charts, needs-attention list, recent activity, latest schools and payments, live announcements and quick actions; every block gated by its own permission; no migrations
- Analytics pages: Schools, Subscriptions, Revenue (without GST, MRR estimate), Payments health
- Analytics pages: Renewals & churn, Inquiries, Plans & modules, Staff & security, System health, Announcements
- Reports areas Schools, Plans, Subscriptions, Billing, GST & invoices and Renewals: 25 report definitions in `Reports/definitions` (shared SQL helpers in `Reports/lib/sql.js`)
- Reports (areas Inquiries, Announcements, User & Access, Audit, System): 14 reports with filters, totals, CSV and Excel export; the master admin's data is hidden from other viewers
- Analytics and Reports foundation (backend + Admin app): date ranges with an Indian financial year setting, CSV and Excel export with an audit entry, auto-loaded dataset and report registries, `GET /admin/analytics[/meta|/:key]`, `GET /admin/reports[/:key]`, global filter bar and Export menu, reference dataset `schools.growth` and report `schools.directory`; no migrations; framework documented in `07-analytics-and-reports.md`
- Invoice PDF download and payment refunds (backend + Admin app): `GET /admin/invoices/:uuid/pdf`, `POST /admin/payments/:uuid/refund`, refund reasons from Settings; no migrations
- Principal tools (resend welcome link, reset password), notification bell (`GET /admin/notifications`, `POST /admin/notifications/seen`) and billing emails (receipt, payment failed) with the Admin app UI; migration `20261025000340-add-last-seen-notifications-to-admin-users.js` written, to be run
- School foundation (backend): `users`, `user_sessions`, `user_password_resets`, `user_login_history` (migrations 000240 to 000243, written, to be run), tenant context and `defineTenantModel`, real `authenticate`, `resolveClient`, `checkSubscription`, `requireModule`, `requireRole`, school auth endpoints, `GET /user/subscription`, role permission map, `PrincipalProvisioner`
- Plan features (backend + Admin app): a text feature list on each plan replaces the module checklist in the plan form; migration `20261025000220-create-plan-features-table.js` written, not yet run
- Payment webhook and billing records (backend): verified idempotent `POST /api/webhooks/payment`, event handlers, payments, GST invoices, dev replay, Billing API (migration 000260 written, to be run)
- Razorpay payment gateway layer (backend): `RazorpayService`, plan and customer sync, subscriptions (create, cancel at period end, manual sync), tables for subscriptions, payments, invoices and webhook events (migrations 000210 to 000214 written, to be run); webhook processing comes later
- Plans & Modules (backend): modules, plans, plan limits, plan modules; admin CRUD with publish, archive, duplicate; public published-plan list (migrations written, not yet run)
- Platform Settings (general, billing and tax, policy, renewals, email) with audit of every change
- Project scaffold: Express app, `index.js` entry, config, `.env.example`, `.gitignore`
- Announcements (backend + Admin app): written, waiting for migrations 20261025000190 and 191
- Sequelize + `sequelize-cli` wired (`.sequelizerc`), database connection settings in `config/database.js`
- `npm run setup` (create DB if missing, migrate, seed) plus separate migration/seeder scripts
- Versioned folder layout (`V1` with Admin / User / Common) for controllers, services, requests, resources, routes
- Route structure with an `index.js` at the top and in each folder
- Import aliases (`@app`, `@config`, `@routes`, `@database`)
- Placeholder `AuthController` with a logging `login` in Admin and User
- Middleware groups (`public`, `admin`, `user`) with placeholder middleware, (the temporary `ping` demo routes were removed)
- `/api/health` endpoint
- Support Inquiries backend (public form, admin inbox, notes, assignment, counts)
- Root `README.md` for new developers
- Admin auth (login, refresh, logout, forgot/reset/change password), sessions, login history, permissions, seeder
- File uploads (temp + commit, signed links) and the Resource base class
- **Users & Access** (staff management): staff list/add/edit/status/delete, reset password, permission checklist with an escalation guard, sessions and login history, audit log (`audit_logs`, migration `20261025000107`, run it before using the audit log or any change)
- Database connection on startup (`app/Helpers/database.js`): prints `Database connected`, or a clear error and stops the server if Postgres is unreachable
- Schools module (backend): tables `clients`, `client_notes`, `client_status_history` (migrations 130-132, to be run by the team), `SchoolService`, `/api/v1/admin/schools` endpoints (list, add, edit, status change with reason, status history, notes, usage, delete archived), `clientLogo` file type

## Next (in order)
0. Final database design (tables, columns, relationships), reviewed with the product owner, then a DOCX
1. Base `Request` class, rule functions and `validate` middleware
2. `BaseModel` with the `client_id` scope and hooks; first migrations (clients, users, roles, permissions, plans, subscriptions)
3. JWT login for Admin and User; real `authenticate`, `resolveClient`, `checkSubscription`
4. Seeders: roles, permissions, default plans, first Super Admin
5. Public signup + checkout + payment webhook (needs gateway decision)
6. School setup modules, then daily operations, fees, reports
7. Audit log, backups, deployment docs

## Open decisions
See the list in [01-project-overview.md](01-project-overview.md#open-decisions).

## Change log
| Date | Change |
|---|---|
| 2026-11-20 | `npm run seed:test-school`: one test school (active offline subscription, draft Test Plan with every module) and a Principal login for web testing on any server, live included. Email and password come from `SEED_TEST_EMAIL` / `SEED_TEST_PASSWORD`, nothing secret in the repo; safe to repeat |
| 2026-11-20 | Add school can set the Principal password: optional `principalPassword` on `POST /admin/schools` creates the Principal login at once (contact email + password, must change at first login, audited as `school.principal_created`, password never logged); Admin Add school form has a "Principal password" field. Provisioning later finds this Principal and sends nothing. The school still needs an active subscription before the Principal can use the workspace |
| 2026-11-15 | School workspace Phase A: tables `classes`, `teacher_profiles`, `students`, `staff_attendance` and school settings columns on `clients` (working days, hours, academic year start month); `/user/classes`, `/user/students`, `/user/teachers`, `/user/school`, `/user/profile`, `/user/dashboard/principal`; `UserInviter` (welcome / set-password link for teachers and parents, link shown once to the Principal); plan limits `max_students`, `max_teachers`, `max_classes` enforced on create and re-activation; `Audit.log` accepts a school user (`{ user }`); new permission `staff_attendance.mark`; rules `time` and `numeric`; dev-only `npm run seed:demo`. Decisions: the parent app signs in with the student's login (role Student, guardian email), chat will be real time with Socket.IO, delivery in phases A/B/C |
| 2026-11-13 | Plan features can link to a module (`plan_features.module_id`, migration 000360) and the plan's modules are rebuilt from the links; per-school entitlement overrides: `client_modules` and `client_limits` (migrations 000361, 000362), `Entitlements` + `EntitlementService`, `GET/PUT/DELETE /admin/schools/:uuid/entitlements...`, new permission `schools.entitlements` (re-run the permissions seeder), `SubscriptionAccess` now returns effective modules and limits |
| 2026-11-12 | Dashboard: `DashboardService`, `DashboardResource`, `GET /admin/dashboard`; revenue is Paid invoice subtotals minus refunds without GST (a refund counts in the period of its invoice), MRR is the monthly amount without GST of Active subscriptions, previous-period Active count and MRR are estimates from start and end dates; the template demo dashboard was removed |
| 2026-11-12 | Analytics pages Schools, Subscriptions, Revenue and Payments health: datasets `schools.growth`, `subscriptions.overview`, `revenue.overview`, `payments.health` (rules written at the top of each file), shared SQL helper `Analytics/helpers/billingSql.js` |
| 2026-11-12 | Analytics (group B): datasets renewals.churn, inquiries.overview, plans.overview, security.overview, system.health, announcements.overview (+ helpers/areaBShared.js) |
| 2026-11-12 | Reports (areas Schools, Plans, Subscriptions, Billing, GST & invoices, Renewals): 25 definitions, revenue without GST with GST in its own column, GST summary by month or financial year, statement per school with running balance, settlement check against our own records (no live Razorpay settlement fetch); no migrations |
| 2026-11-10 | Renewals: `GET /admin/renewals` and `/counts` (due soon, payment failed, in grace, suspended; days from Settings), `subscriptions.past_due_since` kept by a model hook (migration 000280). New settings keys and the `text` and `stringList` setting types (offline payment methods, refund reasons, invoice footer and terms, due-soon window, payment-failed message id, notification switches) with a Notifications group |
| 2026-11-10 | Offline payments: record a payment received outside Razorpay with an admin-chosen valid-until date, offline subscriptions (`source` columns, migration 000320), shared GST invoice numbering, change expiry date, hourly `SubscriptionExpiryJob` (Past due, Suspended, Expired from the grace settings) |
| 2026-11-10 | Principal tools, notification bell and billing emails: `PrincipalService`, `NotificationService`, `BillingMailer`, webhook mail hooks, migration 000340 |
| 2026-11-12 | Reports for Inquiries, Announcements, User & Access, Audit and System: 14 report definitions (list, grouped, response times, spam; history, live now; staff directory, permission matrix, login history, active sessions, inactive staff; audit log, sensitive actions; webhook event log) plus helpers in `Reports/support/` |
| 2026-11-10 | School foundation: school users, login and sessions, tenant context with tenant-scoped models, subscription gate, role permissions, Principal provisioning service |
| 2026-11-10 | Plan features: `plan_features` table and model, `features` on plan create and update, in the admin and public plan responses; Admin plan form shows an Add feature popup instead of the module checklist |
| 2026-11-10 | Payment webhook: `POST /api/webhooks/payment` (raw body, signature, idempotent ingest), handlers for subscription, payment and refund events, payment records, GST invoices with a per-year gapless counter (`invoice_counters`, migration 000260), activation hook, dev-only replay, Billing admin API (webhook events, payments, invoices) |
| 2026-11-10 | Razorpay gateway layer: `RazorpayService`, plan sync on publish, customer and subscription creation, cancel at period end, sync, new billing settings, tables for subscriptions, payments, invoices and webhook events |
| 2026-11-11 | Removed the temporary `ping` routes; announcements can now be aimed at selected schools or plans (`GET /admin/announcements/target-options`, list rows carry their target names); the public active endpoint still serves only all-schools announcements |
| 2026-11-11 | Analytics and Reports foundation: `dateRange` helper (presets, fiscal year, compare), `ExportService` (CSV + Excel, formula guard, row cap, audit), analytics and report registries, endpoints, settings group `reports`, `exceljs` added, CORS exposes `Content-Disposition` |
| 2026-10-25 | Users & Access module: `AdminUserService`, `AuditLogService`, `Audit` and pagination helpers, `array` and `date` rules, `audit_logs` migration and model (extra `description` column), Admin app Users list/detail/permissions/sessions/login history and Audit Log pages |
| 2026-10-25 | Plans & Modules: migrations 000110-000113, modules seeder, `PlanService`, `ModuleService`, `PlanUsage`, public plan list |
| 2026-10-25 | Platform Settings: `platform_settings` migration and model, `config/settings.js`, `Settings` helper with cache, `GET/PUT /admin/settings`, seeder for default keys (migration 000150, seeder 000351) |
| 2026-10-25 | Schools (tenants) module added: `clients`, `client_notes`, `client_status_history`, admin schools API, logo upload type `clientLogo` |
| 2026-10-25 | Support Inquiries module: `inquiries` and `inquiry_notes` tables (migrations 170, 171, not run yet), public form endpoint with rate limit and honeypot, admin list/status/assign/notes/counts/delete with audit entries |
| 2026-10-25 | Announcements module: `announcements` and `announcement_targets` migrations (190, 191), admin API with publish / unpublish and derived status, public active list, `datetime` rule |
| 2026-10-25 | File uploads: `config/files.js`, `Files` helper, local storage driver, temp upload + commit, signed links for private files, `profile_image` on `admin_users` (migrations reset and re-run), Resource base class, `PATCH /admin/profile` |
| 2026-10-25 | Removed the "file loaded" console logs, the autoload helper and the placeholder middleware logs; startup now prints only the database connection and Server ready |
| 2026-10-25 | Migrations and `database/helpers.js` reformatted to expanded multi-line code (rule 6 in conventions) |
| 2026-10-25 | Users & Access scope (admin staff only), permission management as a normal permission with safeguards, master actions logged but visible only to the master |
| 2026-10-25 | Admin permission model decided: master always has all; staff get checklist permissions in a Users & Access module; no admin roles tables |
| 2026-10-25 | Phase 1 scope extended (progress reports, daily diary, year-end promotion, fee and staff extras); login history and sessions, audit rule and master/sub admin seeder decided; Google sign-in via Firebase planned |
| 2026-10-25 | Database design decisions recorded (admin_users vs users, id + uuid, Razorpay, GST, settings-driven policy); final table list and DOCX in progress |
| 2026-10-24 | Added root README.md |
| 2026-10-24 | Startup database connection with clear success/failure logging |
| 2026-10-24 | Initial backend scaffold, versioned structure, route indexes, aliases, middleware groups, DB setup scripts, project docs |
