# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

REST API for Bubbly, a multi-tenant, subscription-based School Management SaaS for preschools. Node.js 24, Express 5, plain JavaScript (CommonJS), PostgreSQL via Sequelize 6. Early scaffold: auth, models and business modules are not built yet, and the current middleware are placeholders that only log.

Detailed team docs are in `claude/` (overview, architecture, folder structure, conventions, setup, progress/change log). **Update the relevant doc there, especially `claude/06-progress.md`, in the same change as the code.**

## Commands

```bash
npm run dev               # start with nodemon
npm start                 # start with node
npm run setup             # create DB if missing + migrate + seed (safe to repeat)
npm run migration         # run pending migrations (also :undo, :status)
npm run seeder            # run all seeders (also seeder:undo)
npm run seed:demo         # dev only: demo school + Principal/Teacher/Parent logins
npx sequelize-cli migration:generate --name create-clients-table
npx sequelize-cli seed:generate --name default-plans
curl http://localhost:3000/api/health
```

There is no test suite or linter yet. To verify a change, run `npm run dev`: startup logs every file under `app/` and every route group with `✔`, and exits on the first file that fails to load (`✖`) or if Postgres is unreachable. Config comes from `.env` (copy `.env.example`).

Do not run `npm audit fix --force`; the two moderate `uuid` warnings are known (inside Sequelize 6) and the fix downgrades Sequelize. Use `npm ci` and add dependencies one at a time.

## Architecture

- **Startup (`index.js`)**: registers `module-alias`, then `app/Helpers/autoload.js` `require`s every `.js` file under `app/` in a fixed folder order (Helpers, Rules, Models, Services, Resources, Requests, Middleware, Controllers, Jobs, Mail, Providers). Any file with a load-time error kills the process, so every file in `app/` must be loadable on its own. Then routes mount at `/api` and the DB connects before `listen`.
- **Request flow**: route -> middleware group -> extra middleware -> controller (thin) -> service (business logic) -> model.
- **Route groups**: `routes/V1/index.js` mounts `Common` -> `/api/v1/common`, `Admin` -> `/api/v1/admin` (platform Super Admin), `User` -> `/api/v1/user` (principal/teacher/student, always scoped to one school). Each folder's `index.js` mounts public routes (e.g. `/auth`) first, then `router.use(groups.<name>)`, then everything else.
- **Middleware groups** (`app/Middleware/groups.js`, usage examples in its header comment): `public` = rateLimit; `admin` = authenticate, requireAdmin; `user` = authenticate, resolveClient, checkSubscription. `withGroup(name, ...extra)` is for single routes outside a grouped section; never use it inside a folder that already applied the group (middleware would run twice).
- **Versioning**: Controllers, Services, Requests, Resources and routes live under `V1/<Admin|User|Common>/`. Models, Middleware, Rules, Jobs, Mail, Providers, Helpers and migrations are shared across versions. V1 must not break once published; V2 copies only what changes. The payment webhook (`/api/webhooks/payment`, planned) is unversioned.
- **Aliases**: `@app`, `@config`, `@routes`, `@database`. Files run directly by `sequelize-cli` (`.sequelizerc`, `config/database.js`, `database/create.js`, migrations, seeders) don't go through `index.js`, so they must use relative paths.
- Folder and file names are case-sensitive (`V1`, `Admin`); production runs on Linux.

## Multi-tenancy rules (most important)

- A **client** is one preschool. All schools share one database; every school-owned table has a `client_id` column (always this name, never `tenant_id`) and an index starting with `client_id`. Platform tables (plans, platform admins, platform audit logs) have no `client_id`.
- `client_id` comes **only from the authenticated user's token**, never from body, query or URL. Controllers never filter by `client_id` by hand; a planned `BaseModel` adds a default scope and a create hook that fills it.
- Raw queries and `unscoped()` are banned outside one small reviewed helper.
- Plan limits and enabled modules are enforced in the backend (e.g. `requireModule('fees')`), never only in the UI.

## Conventions

- Schema changes only through migrations; never `sequelize.sync()`.
- Paginate every list endpoint.
- Use `app/Helpers/logger.js` (`title`, `ok`, `info`, `warn`, `error`, `dim`) instead of `console.log`.
- Validation (planned) uses custom Laravel-style Request classes, **not Zod/Joi**: one class per action in `app/Requests/V1/<group>/` with `authorize()`, `rules()` (pipe strings like `'required|string|min:2'`) and `messages()`, applied via a `validate(RequestClass)` middleware. Failures return 422 with per-field errors; fields not in `rules()` are stripped. Rule functions live in `app/Rules/`; `unique`/`exists` scope by `client_id`.
- Payment subscription state changes only via verified, idempotent webhooks. Audit-log plan/permission/client-status changes, attendance corrections, fees, leave decisions and support access.
- The `ping`, `ping-extra` and `ping-solo` routes are temporary middleware demos, to be removed.
