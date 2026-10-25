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

## Files (uploads)
- **Rules live in `config/files.js`**: one entry per type (`adminProfile`, ...) with folder, allowed extensions, max size, max files, `private` or `public`, and link lifetime. The Admin app reads them from `GET /api/v1/admin/files/rules?type=...`.
- **The database stores only the file name**, for example `20261025-143012-a1b2c3.png` (date, time, random part, extension). The folder always comes from the type.
- **Flow:** `POST /api/v1/admin/files/upload?type=adminProfile` (form field `file`) saves into `storage/temp/<owner>/` and returns the temp name. The form that uses it sends that name; the service calls `Files.commit(type, tempName, { owner })`, which re-checks the file and moves it into the real folder. After the database update succeeds the old file is deleted with `Files.remove`. Temp files nobody saved are deleted after 24 hours.
- **Checks:** extension against the type, size, and the real file content (jpg, png, gif, webp, pdf signatures). Temp folders are per user, so nobody can use somebody else's upload. SVG is not allowed by default.
- **Reading:** private types are served at `/api/files/<type>/<name>` only with a signed, expiring link (`?expires=&signature=`); anything wrong answers 404.
- **Storage driver:** `STORAGE_DRIVER=local` (this server's disk). An `s3` driver (R2 or S3) can be added in `app/Providers/Storage/` later; names in the database stay the same, so switching means copying the files and changing the setting.
- Uploads use the `multer` package (kept on a patched version).

## Request classes: clearing a value
Add `nullable` to a field (for example `phone: 'nullable|string|max:30'`) so an empty value is saved as `null` instead of being ignored.

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
