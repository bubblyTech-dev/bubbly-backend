# 04. Conventions

## Import aliases
Use aliases instead of `../../`:
```js
const logger = require('@app/Helpers/logger');
const config = require('@config/app');
```
| Alias | Folder |
|---|---|
| `@app` | `app/` |
| `@config` | `config/` |
| `@routes` | `routes/` |
| `@database` | `database/` |

Defined in `package.json` (`_moduleAliases`) and `jsconfig.json`. `index.js` registers them on its first line. Files run by the Sequelize CLI (`database/create.js`, `.sequelizerc`, config, migrations, seeders) do **not** go through `index.js`, so use relative paths there.

## Adding a new endpoint (checklist)
1. Create a controller in `app/Controllers/V1/<Admin|User|Common>/`.
2. Put business logic in `app/Services/V1/<same group>/`.
3. Add a route file in `routes/V1/<same group>/` and mount it in that folder's `index.js`.
4. Add validation (Request class) and any extra middleware on the route.
5. Run `npm run dev` and check the startup log shows your files and route with `✔`.
6. Update the docs in this folder.

## Middleware groups
Defined in `app/Middleware/groups.js` (usage comments are at the top of that file).

| Group | Middleware, in order | Applied to |
|---|---|---|
| `public` | rateLimit | Common |
| `admin` | authenticate, requireAdmin | Admin |
| `user` | authenticate, resolveClient, checkSubscription | User |

How to use:
- **Whole folder:** in the folder's `index.js` mount public routes (login) first, then `router.use(groups.user)`, then everything else. Routes mounted after the group line get the whole group.
- **One route, group + extras:** `withGroup('user', requireModule('fees'))`.
- **One route, single middleware only:** `router.get('/me', authenticate, handler)`.
- **Inside an already grouped folder:** just add the extra, e.g. `requirePermission('students.create')`.
- Do not use `withGroup` inside a folder that already applied the group (it would run twice).

Current middleware are **placeholders that only log**. Real logic (JWT, client resolution, subscription checks) is planned.

## Validation (planned): Laravel-style Request classes, no library
- One class per action in `app/Requests/V1/<group>/`, e.g. `StoreStudentRequest`, `UpdateStudentRequest`.
- Each extends a base `Request` and defines `authorize()`, `rules()` (pipe strings like `'required|string|min:2'`) and `messages()`.
- Routes use a `validate(StoreStudentRequest)` middleware. Failures return **422** with per-field errors.
- Only fields listed in `rules()` pass through (unknown fields are stripped), so `client_id` can never be injected from the request body.
- Rule functions live in `app/Rules/`. `unique` and `exists` automatically scope by `client_id`.

## Controllers
Thin. Read validated input, call a service, return JSON. No business logic and no `client_id` filtering by hand.

## Database
- Schema changes **only through migrations** (`database/migrations`). Never `sync()`.
- Every school-owned table has `client_id`. Add an index starting with `client_id` for list queries.
- Always paginate list endpoints.

### Migration rules (decided 2026-10-25)
1. In `admin_users` and `users`, **only `email` is required** (NOT NULL). Every other column is optional.
2. **No `unique: true` or unique indexes in migrations.** Uniqueness (for example email) is checked in code with the `unique` validation rule.
3. **Status columns are integers**, with the meaning in the column comment, for example `1: Active, 2: Inactive`.
4. **Add proper indexes** (non-unique): `client_id`, `uuid`, every foreign key, `email`, `status` and common filter or date columns.
5. Every table has an internal `id` and a public `uuid` (`UUID`, default `gen_random_uuid()`), written out in each migration; the API uses only the `uuid`.
6. **Write migrations in expanded, readable form**: one property per line, every column on its own lines, one index per line in long lists. No one-line column definitions.

## Resources (API output, like Laravel)
Every response body is shaped by a Resource in `app/Resources/V1/<Admin|User|Common>/`. It extends `app/Resources/Resource.js` and returns only the fields that may leave the server.
```js
AdminUserResource.make(admin, { permissions })                  // one item
AdminUserResource.collection(admins)                            // a list
AdminUserResource.paginate({ rows, count, page, perPage })      // { data, meta: { page, perPage, total, lastPage } }
```
Use `this.when(condition, value)` for optional fields and `Files.url(type, name)` inside `toArray()` to turn a stored file name into a full link.

## Users & Access (staff) and the audit log
- Manages **staff only** (`type` 2). Master accounts are never listed or changed there; they change their own details under Account Settings.
- Permissions are checked per route with `requirePermission('users_access.view')` and friends (see `config/permissions.js`).
- **Nobody can change their own status, permissions or password, or delete themselves, through this module.**
- **Escalation guard:** a non-master can only grant permissions they hold themselves. Permissions the staff member already has and the actor does not hold stay untouched; asking for one the actor lacks answers 422 on `permissions`.
- Every change runs in a transaction together with its audit row: `Audit.log({ admin, ip, userAgent }, 'admin_user.created', { entityType, entityUuid, description, before, after }, { transaction })`. Never put passwords, hashes or tokens in `before` or `after`; use `Audit.pick(model, [allowed fields])`.
- `audit_logs` is append-only, has no foreign keys, and rows written by the master (`actor_is_master = 1`) are hidden from every other admin. It has one column more than the first design: `description` (a short human summary).
- Lists use `paginationParams(req.validated)` (default 15, max 100) and `Resource.paginate(...)`, which answers `{ data, meta: { page, perPage, total, lastPage } }`.

## Files (uploads)
- **Rules live in `config/files.js`**: one entry per type (`adminProfile`, ...) with folder, allowed extensions, max size, max files, `private` or `public`, and link lifetime. The Admin app reads them from `GET /api/v1/admin/files/rules?type=...`.
- **The database stores only the file name**, for example `20261025-143012-a1b2c3.png` (date, time, random part, extension). The folder always comes from the type.
- **Flow:** `POST /api/v1/admin/files/upload?type=adminProfile` (form field `file`) saves into `storage/temp/<owner>/` and returns the temp name. The form that uses it sends that name; the service calls `Files.commit(type, tempName, { owner })`, which re-checks the file and moves it into the real folder. After the database update succeeds the old file is deleted with `Files.remove`. Temp files nobody saved are deleted after 24 hours.
- **Checks:** extension against the type, size, and the real file content (jpg, png, gif, webp, pdf signatures). Temp folders are per user, so nobody can use somebody else's upload. SVG is not allowed by default.
- **Reading:** private types are served at `/api/files/<type>/<name>` only with a signed, expiring link (`?expires=&signature=`); anything wrong answers 404.
- **Storage driver:** `STORAGE_DRIVER=local` (this server's disk). An `s3` driver (R2 or S3) can be added in `app/Providers/Storage/` later; names in the database stay the same, so switching means copying the files and changing the setting.
- Uploads use the `multer` package (kept on a patched version).

## Plans and modules
- **Modules** (`modules` table, model `AppModule`) are the features a school can use. Seeded by `database/seeders/20261025000301-modules.js` (safe to re-run, never overwrites edited names). A **core** module is part of every plan and cannot be made inactive; the server adds core modules to every plan.
- **Plans** (`plans`, `plan_limits`, `plan_modules`): money is stored in **paise**. Status `1: Draft, 2: Published, 3: Archived`. Limit keys live in `config/plans.js` (a limit with no value is unlimited).
- **Lifecycle:** Draft (everything editable) -> Published (price, interval, tax and slug are locked; name, description, sort, featured, limits and modules can still change, but limits and modules can only shrink while no school uses the plan) -> Archived (read only). To change the price of a published plan, **duplicate** it: the copy is a new draft with `version + 1`.
- Only a draft can be deleted (soft delete), and only when nobody uses it. `PlanUsage.count(plan)` returns 0 until subscriptions exist; change only that function then.
- `GET /api/v1/common/plans` is the public list (published plans only, no internal fields).
## Schools (clients)
- A school is a row in `clients`; `clients.id` is the tenant id used as `client_id` in every school-owned table. The API only ever shows its `uuid`.
- Status: `1: Active, 2: Suspended, 3: Archived`. Allowed changes: Active to Suspended or Archived, Suspended to Active or Archived, Archived to Active. Every change needs a reason and is written to `client_status_history` and the audit log.
- The slug is made from the name when the school is added and is unique in code (deleted schools count too). It is not editable.
- Only an Archived school can be deleted (soft delete).
- GST numbers are checked for the 15-character GSTIN format and stored in upper case.
- One contact per school for now (name, email, phone on the `clients` row). More contacts would be a separate table later.
- Staff notes live in `client_notes` and are never shown to the school.
- The logo uses the `clientLogo` file type (`config/files.js`).

## Request classes: clearing a value
Add `nullable` to a field (for example `phone: 'nullable|string|max:30'`) so an empty value is saved as `null` instead of being ignored.

## Platform settings
- Every setting is defined once in `config/settings.js` (key, group, type, default, label, limits). Saved values live in the `platform_settings` table (key, JSON value, group). A missing row means the default is used, and the seeder only adds missing keys, so it never overwrites an edited value.
- Read a value anywhere with `await Settings.get('policy.grace_days')` or `await Settings.group('billing')` (`app/Helpers/settings.js`). Saved values are cached in memory and refreshed when a group is saved.
- API: `GET /api/v1/admin/settings` (`settings.view`) and `PUT /api/v1/admin/settings/:group` (`settings.edit`, body `{ "key": value }`, only keys of that group, validated by type and limits, saved in one transaction with one audit entry per changed key). Unchanged values are not audited.
- Settings are not for secrets: never store API keys, tokens or passwords there (those stay in `.env`).
## Public forms (no login)
Public endpoints in `routes/V1/Common` use a strict `rateLimit({ name, windowMs, max })`, a hidden honeypot field (a filled field means a bot: save nothing, answer exactly like a normal success) and the same generic success message for every outcome. Example: `POST /api/v1/common/inquiries`.
## Announcements (platform notices to schools)
- Table `announcements` plus `announcement_targets` (school or plan the notice is aimed at). `target_id` is a plain indexed number with no foreign key, because schools and plans are separate modules.
- **Status is worked out from the dates**: stored `1: Draft`, `2: Scheduled`, `3: Published`; `Scheduled`, `Published` and `Expired` are derived when read (`AnnouncementResource.effectiveStatus`), and the list filter uses the same rules in SQL. Nothing has to run in the background when a notice starts or ends.
- Edit locks: Draft and Scheduled can change everything; Published can only change `endsAt`; Expired must be unpublished first. Publishing needs an end time after the start and in the future.
- Audience: type 1 (all schools) works now. Types 2 and 3 take `targetUuids` and are resolved by `AnnouncementTargetResolver` using the `Client` and `Plan` models; until those exist the API answers 422. Requests only carry uuids.
- Schools read `GET /api/v1/common/announcements/active` (public group, rate limited). It returns only announcements for all schools until school login exists; per-school targeting is added then.
- Audit actions: `announcement.created / updated / published / unpublished / deleted`.
- The request rule `datetime` accepts ISO times such as `2026-11-01T09:30`.

## Git
- Never commit `.env`, keys, dumps or uploads (see `.gitignore`).
- Commit `package-lock.json`.
- Keep commits focused. Update these docs in the same change as the code.

## Logging
`app/Helpers/logger.js` prints readable terminal output (`ok`, `info`, `warn`, `error`). Use it instead of raw `console.log`.
