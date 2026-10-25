# 03. Folder Structure

Laravel-style, flat under `app/` (no `core/`, no `Http/`). Folder names are **case-sensitive** because the server runs Linux: `V1`, `Admin`, `User`, `Common`. URLs stay lowercase (`/api/v1/...`).

```
backend/
├── index.js                 main entry: loads aliases, app files, routes, starts server
├── package.json
├── jsconfig.json            editor support for the @ aliases
├── .sequelizerc             tells sequelize-cli where config/migrations/seeders are
├── .env.example             variable NAMES only (copy to .env, never commit .env)
│
├── app/
│   ├── Controllers/V1/{Admin,User,Common}/   e.g. AuthController.js
│   ├── Services/V1/{Admin,User,Common}/      business logic
│   ├── Requests/V1/{Admin,User,Common}/      one validation class per action (planned)
│   ├── Resources/V1/{Admin,User,Common}/     shape the JSON output
│   ├── Rules/                                validation rule functions (planned)
│   ├── Middleware/                           authenticate, resolveClient, groups.js, ...
│   ├── Models/                               Sequelize models (+ BaseModel, planned)
│   ├── Jobs/                                 background jobs (BullMQ, planned)
│   ├── Mail/                                 email templates
│   ├── Providers/                            payment gateway, storage, mailer adapters
│   └── Helpers/                              logger.js, database.js (shared Sequelize instance + startup connect), response helpers
│
├── config/                  app.js, database.js, auth.js, permissions.js, files.js (file types, rules, disks)
├── database/
│   ├── create.js            creates the DB if missing (used by npm run setup)
│   ├── migrations/          versioned schema changes
│   └── seeders/             roles, permissions, default plans, first Super Admin
├── routes/
│   ├── index.js             main router: /api/health and /api/v1
│   └── V1/
│       ├── index.js         mounts Common, Admin, User
│       ├── Admin/index.js   + one route file per feature
│       ├── User/index.js
│       └── Common/index.js
├── storage/                 logs, uploads (final files), temp (waiting uploads) (contents are git-ignored)
└── claude/                  these docs
```

## Which folder is versioned?
`app/Helpers/files.js` is the one place for file work; `app/Providers/Storage/` holds the disk drivers (`local` now, `s3` later). `app/Resources/Resource.js` is the base class for API output.

Versioned (`V1/...`): Controllers, Services, Requests, Resources, routes.
Not versioned: Rules, Middleware, Models, Jobs, Mail, Providers, Helpers, migrations.

## What `Admin`, `User`, `Common` mean
- **Admin:** Super Admin and platform staff endpoints (`/api/v1/admin/...`).
- **User:** principal, teacher and student endpoints (`/api/v1/user/...`), always scoped to one `client_id`.
- **Common:** public site (plans, signup, contact), public login, webhooks, anything shared by both (`/api/v1/common/...`).

## Temporary files (delete later)
`routes/V1/*/ping.js` and the `ping-solo` route in `routes/V1/User/index.js` are demos for the middleware order. Remove them once real routes exist.
