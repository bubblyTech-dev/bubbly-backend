# 06. Progress

_Update this file whenever something is finished, started or decided._

## Done
- Project scaffold: Express app, `index.js` entry, config, `.env.example`, `.gitignore`
- Sequelize + `sequelize-cli` wired (`.sequelizerc`), database connection settings in `config/database.js`
- `npm run setup` (create DB if missing, migrate, seed) plus separate migration/seeder scripts
- Versioned folder layout (`V1` with Admin / User / Common) for controllers, services, requests, resources, routes
- Route structure with an `index.js` at the top and in each folder
- Import aliases (`@app`, `@config`, `@routes`, `@database`)
- Placeholder `AuthController` with a logging `login` in Admin and User
- Middleware groups (`public`, `admin`, `user`) with placeholder middleware, plus temporary `ping` demo routes
- `/api/health` endpoint
- Root `README.md` for new developers
- Admin auth (login, refresh, logout, forgot/reset/change password), sessions, login history, permissions, seeder
- File uploads (temp + commit, signed links) and the Resource base class
- **Users & Access** (staff management): staff list/add/edit/status/delete, reset password, permission checklist with an escalation guard, sessions and login history, audit log (`audit_logs`, migration `20261025000107`, run it before using the audit log or any change)
- Database connection on startup (`app/Helpers/database.js`): prints `Database connected`, or a clear error and stops the server if Postgres is unreachable

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
| 2026-10-25 | Users & Access module: `AdminUserService`, `AuditLogService`, `Audit` and pagination helpers, `array` and `date` rules, `audit_logs` migration and model (extra `description` column), Admin app Users list/detail/permissions/sessions/login history and Audit Log pages |
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
