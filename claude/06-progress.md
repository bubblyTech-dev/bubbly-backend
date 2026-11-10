# 06. Progress

_Update this file whenever something is finished, started or decided._

## Done
- School foundation (backend): `users`, `user_sessions`, `user_password_resets`, `user_login_history` (migrations 000240 to 000243, written, to be run), tenant context and `defineTenantModel`, real `authenticate`, `resolveClient`, `checkSubscription`, `requireModule`, `requireRole`, school auth endpoints, `GET /user/subscription`, role permission map, `PrincipalProvisioner`
- Plan features (backend + Admin app): a text feature list on each plan replaces the module checklist in the plan form; migration `20261025000220-create-plan-features-table.js` written, not yet run
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
- Middleware groups (`public`, `admin`, `user`) with placeholder middleware, plus temporary `ping` demo routes
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
| 2026-11-10 | School foundation: school users, login and sessions, tenant context with tenant-scoped models, subscription gate, role permissions, Principal provisioning service |
| 2026-11-10 | Plan features: `plan_features` table and model, `features` on plan create and update, in the admin and public plan responses; Admin plan form shows an Add feature popup instead of the module checklist |
| 2026-11-10 | Razorpay gateway layer: `RazorpayService`, plan sync on publish, customer and subscription creation, cancel at period end, sync, new billing settings, tables for subscriptions, payments, invoices and webhook events |
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
