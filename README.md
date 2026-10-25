# Bubbly Backend

REST API for **Bubbly**, a multi-tenant, subscription-based School Management SaaS for preschools.

A preschool (a **client**) subscribes to a plan and gets its own isolated workspace for students, teachers, attendance, homework, timetable, leave, fees and announcements. A separate Super Admin console manages plans, schools and billing.

> **Status:** early development (project scaffold). Authentication, models and business modules are not built yet. See [Roadmap](#roadmap).

---

## Table of contents
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [npm scripts](#npm-scripts)
- [Project structure](#project-structure)
- [API](#api)
- [How it works](#how-it-works)
- [Development guide](#development-guide)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Roadmap](#roadmap)
- [Security](#security)
- [License](#license)

---

## Tech stack

| Area | Choice |
|---|---|
| Runtime | Node.js 24 LTS (use the latest 24.x patch) |
| Framework | Express 5 (CommonJS) |
| Database | PostgreSQL |
| ORM and migrations | Sequelize 6 and `sequelize-cli` |
| Security middleware | helmet, cors |
| Config | dotenv |
| Import aliases | module-alias |
| Dev tooling | nodemon |

Planned: JWT authentication, BullMQ + Redis for background jobs, a payment gateway with webhooks, S3-compatible file storage.

---

## Getting started

### Prerequisites
- **Node.js 24.x**, latest patch (install with [nvm](https://github.com/nvm-sh/nvm): `nvm install 24`). Older 24.x builds miss the October 2026 security fixes.
- **PostgreSQL** running locally (a native install, DBngin, or any other method). pgAdmin is handy for browsing data.
- **Git**

### Setup
```bash
# 1. Clone and enter the project
git clone <repository-url>
cd <repository-folder>

# 2. Install dependencies (uses the lockfile)
npm ci

# 3. Create your local environment file, then edit the values
cp .env.example .env

# 4. Create the database (if missing), run migrations and seeders
npm run setup

# 5. Start the API with auto-restart
npm run dev
```

### Verify it works
The terminal prints:
```
✔ Database connected  (bubbly @ 127.0.0.1:5432, user: postgres)
Server ready
✔ http://localhost:3000/api/health
```
```bash
curl http://localhost:3000/api/health
# {"status":"ok","app":"Bubbly","env":"development","time":"..."}
```
If any file fails to load, you get a `✖` line with the file name and error, and the server stops. If Postgres is unreachable, the server stops with a clear message.

---

## Environment variables

Copy `.env.example` to `.env`. **Never commit `.env`.**

| Variable | Description | Default / example |
|---|---|---|
| `NODE_ENV` | `development`, `test` or `production` | `development` |
| `APP_NAME` | Name shown in logs and health check | `Bubbly` |
| `PORT` | HTTP port | `3000` |
| `DB_HOST` | Postgres host | `127.0.0.1` |
| `DB_PORT` | Postgres port | `5432` |
| `DB_NAME` | Database name | `bubbly` |
| `DB_USER` | Postgres user | `postgres` |
| `DB_PASSWORD` | Postgres password | set your own (can be empty on a local passwordless setup only) |

---

## npm scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with nodemon (auto-restart on changes) |
| `npm start` | Start with node |
| `npm run setup` | Create the DB if missing, run migrations, run seeders (safe to repeat) |
| `npm run db:create` | Create the database only if it does not exist |
| `npm run migration` | Run pending migrations |
| `npm run migration:undo` | Undo the last migration |
| `npm run migration:status` | Show which migrations have run |
| `npm run seeder` | Run all seeders |
| `npm run seeder:undo` | Undo all seeders |

Generate new files with the Sequelize CLI:
```bash
npx sequelize-cli migration:generate --name create-clients-table
npx sequelize-cli seed:generate --name default-plans
```

---

## Project structure

Laravel-style, flat under `app/`. Folder names are **case-sensitive** (the server runs Linux).

```
.
├── index.js                  # entry point
├── app/
│   ├── Controllers/V1/       # Admin | User | Common
│   ├── Services/V1/          # business logic (Admin | User | Common)
│   ├── Requests/V1/          # validation classes (planned)
│   ├── Resources/V1/         # JSON output shaping
│   ├── Rules/                # validation rule functions (planned)
│   ├── Middleware/           # authenticate, resolveClient, groups.js, ...
│   ├── Models/               # Sequelize models
│   ├── Jobs/  Mail/  Providers/
│   └── Helpers/              # logger, database
├── config/                   # app.js, database.js
├── database/                 # create.js, migrations/, seeders/
├── routes/
│   ├── index.js              # /api/health and /api/v1
│   └── V1/                   # index.js + Admin/, User/, Common/
├── storage/                  # logs, uploads (git-ignored contents)
└── claude/                   # team documentation
```

| Group | Who it serves | URL prefix |
|---|---|---|
| **Admin** | Platform Super Admin and staff | `/api/v1/admin` |
| **User** | Principal, teacher, student (always scoped to one school) | `/api/v1/user` |
| **Common** | Public site, public auth, webhooks | `/api/v1/common` |

Controllers, Services, Requests, Resources and routes are **versioned** (`V1`, later `V2`). Models, Middleware, Rules, Jobs, Mail, Providers and Helpers are shared across versions.

---

## API

Base URL: `http://localhost:3000/api`

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/health` | Health check | Working |
| POST | `/v1/user/auth/login` | Principal / teacher / student login | Placeholder (logs only) |
| POST | `/v1/admin/auth/login`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password` | Admin sign-in flow | Working |
| GET | `/v1/admin/auth/me` | Logged-in admin | Working |
| POST | `/v1/admin/auth/change-password` | Change own password | Working |
| PATCH | `/v1/admin/profile` | Update own name, phone and photo | Working |
| GET | `/v1/admin/files/rules?type=` | Allowed extensions and size for a file type | Working |
| GET | `/v1/admin/announcements`, `/:uuid` | List and read announcements | Working |
| POST | `/v1/admin/announcements` | Create a draft announcement | Working |
| PATCH | `/v1/admin/announcements/:uuid` | Edit (Published: end time only) | Working |
| POST | `/v1/admin/announcements/:uuid/publish`, `/unpublish` | Publish or take back to draft | Working |
| DELETE | `/v1/admin/announcements/:uuid` | Soft delete | Working |
| GET | `/v1/common/announcements/active` | What schools should show now (public) | Working |
| POST | `/v1/admin/files/upload?type=` | Upload one file to temp (field `file`) | Working |
| GET | `/files/:type/:name` | Serve a stored file (signed link for private types) | Working |
| GET | `/v1/{admin,user,common}/ping`, `/ping-extra`; `GET /v1/user/ping-solo` | Middleware order demos | **Temporary**, to be removed |

Unknown routes return `404` with `{ "message": "Route not found: ..." }`.

---

## How it works

**Request flow**
```
route -> middleware group -> (extra middleware) -> controller -> service -> model
```
Controllers stay thin. Business logic lives in services. Models talk to the database.

**Multi-tenancy.** All schools share one database. A *client* is one preschool. Every school-owned table has a `client_id` column, which comes **only from the logged-in user's token**, never from the request. A user from one school must never be able to read or change another school's data.

**Middleware groups.** `app/Middleware/groups.js` defines named bundles of middleware (`public`, `admin`, `user`). Apply a group once per route folder, and add extra middleware to individual routes. Usage examples are in the comment at the top of that file.

**Entitlements.** Plan limits and enabled modules are enforced in the backend (for example `requireModule('fees')`), never only by hiding menu items in the UI.

---

## Development guide

**Import aliases** (instead of `../../`):

| Alias | Folder |
|---|---|
| `@app` | `app/` |
| `@config` | `config/` |
| `@routes` | `routes/` |
| `@database` | `database/` |

Files run directly by the Sequelize CLI (`database/create.js`, `.sequelizerc`, config, migrations, seeders) use relative paths.

**Adding an endpoint**
1. Controller in `app/Controllers/V1/<Admin|User|Common>/`
2. Business logic in `app/Services/V1/<same group>/`
3. Route file in `routes/V1/<same group>/`, mounted in that folder's `index.js`
4. Validation and any extra middleware on the route
5. Run `npm run dev` and confirm your files and route show `✔` in the startup log
6. Update the docs in `claude/`

**Rules**
- Schema changes go through **migrations only**, never `sync()`.
- Every school-owned table gets `client_id` and an index that starts with it.
- Paginate every list endpoint.
- No secrets in git. Commit `package-lock.json`.
- Add dependencies deliberately, one at a time. Install in CI and deploys with `npm ci`.
- Update the docs in `claude/` in the same change as the code.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Database connection failed ... ECONNREFUSED` | Start Postgres and check `DB_HOST`, `DB_PORT` in `.env` |
| `password authentication failed` | Fix `DB_USER` / `DB_PASSWORD` in `.env` |
| `EADDRINUSE :3000` | Another process uses the port. Stop it or change `PORT` |
| `Cannot find module '@app/...'` | Run from the project root; check `_moduleAliases` in `package.json` |
| Module not found only on Linux | Folder and file names are case-sensitive; match the exact case (`V1`, `Admin`) |
| `⚠ <folder> folder missing` at startup | Harmless: empty folders are not tracked by git |
| `npm audit` shows 2 moderate `uuid` warnings | Known (inside Sequelize 6). Do **not** run `npm audit fix --force`; it downgrades Sequelize |

---

## Documentation

Detailed team docs live in [`claude/`](claude/README.md):

| Doc | Contents |
|---|---|
| [01 Project overview](claude/01-project-overview.md) | Product, roles, buy flow, scope |
| [02 Architecture](claude/02-architecture.md) | Stack, multi-tenancy, security rules, versioning |
| [03 Folder structure](claude/03-folder-structure.md) | What goes where |
| [04 Conventions](claude/04-conventions.md) | Coding rules, middleware groups, validation |
| [05 Setup](claude/05-setup.md) | Local setup and scripts |
| [06 Progress](claude/06-progress.md) | Done, next, open decisions, change log |

---

## Roadmap

- [x] Project scaffold, versioned structure, aliases, startup logging
- [x] Database connection and setup scripts
- [x] Middleware groups (placeholders)
- [ ] Request validation classes and `validate` middleware
- [ ] Base model with `client_id` scope; first migrations (clients, users, roles, permissions, plans, subscriptions)
- [ ] JWT authentication for Admin and User
- [ ] Seeders (roles, permissions, plans, first Super Admin)
- [ ] Public signup, checkout and payment webhooks
- [ ] School modules: students, teachers, classes, attendance, homework, timetable, leave, fees, announcements
- [ ] Audit logs, backups, deployment

---

## Security

- Never commit `.env`, keys, certificates or database dumps (see `.gitignore`).
- Passwords are hashed. Raw card data is never stored; payments use the gateway's hosted checkout with verified webhooks.
- To report a vulnerability, contact the maintainers privately. Do not open a public issue.

---

## License

Proprietary. All rights reserved.
