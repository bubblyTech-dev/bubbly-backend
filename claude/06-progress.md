# 06. Progress

_Update this file whenever something is finished, started or decided._

## Done
- Project scaffold: Express app, `index.js` entry, config, `.env.example`, `.gitignore`
- Sequelize + `sequelize-cli` wired (`.sequelizerc`), database connection settings in `config/database.js`
- `npm run setup` (create DB if missing, migrate, seed) plus separate migration/seeder scripts
- Autoload with terminal logging of every loaded file and route
- Versioned folder layout (`V1` with Admin / User / Common) for controllers, services, requests, resources, routes
- Route structure with an `index.js` at the top and in each folder
- Import aliases (`@app`, `@config`, `@routes`, `@database`)
- Placeholder `AuthController` with a logging `login` in Admin and User
- Middleware groups (`public`, `admin`, `user`) with placeholder middleware, plus temporary `ping` demo routes
- `/api/health` endpoint
- Root `README.md` for new developers
- Database connection on startup (`app/Helpers/database.js`): prints `Database connected`, or a clear error and stops the server if Postgres is unreachable

## Next (in order)
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
| 2026-10-24 | Added root README.md |
| 2026-10-24 | Startup database connection with clear success/failure logging |
| 2026-10-24 | Initial backend scaffold, versioned structure, route indexes, aliases, middleware groups, DB setup scripts, project docs |
