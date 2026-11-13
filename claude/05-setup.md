# 05. Local Setup

## Requirements
- **Node.js v24 (latest LTS patch).** Use nvm. Older 24.x versions miss the October 2026 security fixes, so install the newest 24.x patch.
- **PostgreSQL** running locally (any recent version; DBngin or a native install both work). pgAdmin is handy for browsing.
- Redis is **not needed yet** (planned for background jobs).

## First time
```bash
cd backend
npm install
cp .env.example .env      # then edit the values in .env
npm run setup             # creates the DB if missing, runs migrations, runs seeders
npm run dev               # starts the API with auto-restart
```

`.env` variables (names only, set your own values):
```
NODE_ENV, APP_NAME, PORT
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
```
Never commit `.env`.

## What you should see on `npm run dev`
- `Database connected (<db> @ <host>:<port>)`, or a clear error and the server stops if Postgres is unreachable.
- `Server ready` with the health URL.

If a file is broken you get a `✖` line with the file and error, and the server stops.

Quick check: `GET http://localhost:3000/api/health` returns `{"status":"ok", ...}`.

## npm scripts
| Command | What it does |
|---|---|
| `npm run dev` | Start with nodemon (auto restart) |
| `npm start` | Start with node (production style) |
| `npm run setup` | Create DB if missing, then migrate, then seed (safe to run repeatedly) |
| `npm run db:create` | Create the database only if it does not exist |
| `npm run migration` | Run pending migrations |
| `npm run migration:undo` | Undo the last migration |
| `npm run migration:status` | Show migration status |
| `npm run seeder` | Run all seeders |
| `npm run seeder:undo` | Undo all seeders |

Generate new files with the Sequelize CLI:
```bash
npx sequelize-cli migration:generate --name create-clients-table
npx sequelize-cli seed:generate --name default-plans
```

## Dependencies policy
Add packages deliberately and one at a time (npm supply-chain attacks are active in 2026). Commit the lockfile, install with `npm ci` in CI/deploy, and run `npm audit` now and then. Known: `npm audit` reports 2 moderate `uuid` warnings inside Sequelize 6; the suggested fix downgrades Sequelize to v3, so do **not** run `npm audit fix --force`.

`multer` is pinned to 2.5.0 on purpose: every older version has known denial-of-service advisories. It is only a few days old, so re-check `npm audit` when updating.
