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

## Git
- Never commit `.env`, keys, dumps or uploads (see `.gitignore`).
- Commit `package-lock.json`.
- Keep commits focused. Update these docs in the same change as the code.

## Logging
`app/Helpers/logger.js` prints readable terminal output (`ok`, `info`, `warn`, `error`). Use it instead of raw `console.log`.
