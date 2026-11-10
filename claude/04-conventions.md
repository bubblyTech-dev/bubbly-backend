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
- **Features** (`plan_features`, model `PlanFeature`): the plan form has a simple list of text lines (max 30, each 1-200 characters, no repeats in any letter case) that the admin adds, edits, reorders and removes. They are only the description shown on the pricing page and never control access (modules and limits do that). Send `features` as an array of strings on create or update; it replaces the whole list, an empty array clears it, leaving it out keeps it. A feature that stays in the list keeps its row and uuid. Features may change on a Published plan (text only) but not on an Archived one, and a duplicate copies them. The admin form no longer shows a module picker; core modules are still added to every plan by the server, so the publish rule that a plan needs a module still passes.
- Only a draft can be deleted (soft delete), and only when nobody uses it. `PlanUsage.count(plan)` returns 0 until subscriptions exist; change only that function then.
- `GET /api/v1/common/plans` is the public list (published plans only, no internal fields). Each plan carries `features`, an ordered list of titles. The older `modules` field is no longer part of this response.
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
- **Types** (`type` in `config/settings.js`): `string`, `text` (long, multi-line), `integer`, `number`, `boolean`, `integerList` (numbers) and `stringList` (a list of short texts: trimmed, empty lines and repeats dropped, `maxItems` and `maxItemLength` apply, at least one item). The Settings page shows a stringList as chips and a text as a multi-line box.
- Groups: General, Billing & Tax, Policy, Renewals, Email and Notifications. New in this round: `renewals.due_soon_days`, `billing.offline_payment_methods`, `billing.refund_reasons`, `billing.invoice_footer`, `billing.invoice_terms`, `email.loops_tx_payment_failed`, `notifications.show_failed_payments` and `notifications.show_new_inquiries`.
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

## Payment gateway (Razorpay Subscriptions)
- **One file talks to Razorpay**: `app/Services/V1/Common/PaymentGateway/RazorpayService.js`. Add a new Razorpay call there, never anywhere else. Keys come only from `.env` (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) through `config/payment.js` and are never logged.
- **Store every Razorpay id** we get back in its own column: `plans.razorpay_plan_id`, `clients.razorpay_customer_id`, `subscriptions.razorpay_subscription_id` (plus plan and customer), and the payment, order, invoice and refund ids on `payments`/`invoices`.
- **Razorpay has no separate products**: a plan carries the item (name, amount, currency). A Razorpay plan cannot be edited, so it is created once when a plan is published (or with `POST /admin/plans/:uuid/sync-gateway`) and never re-created. A published plan's price is already locked in our own rules.
- **Razorpay first, then our database**: if Razorpay refuses, nothing is saved on our side. Publishing a plan fails with the gateway message and the plan stays a draft; without keys a plan still publishes and stays "not synced".
- **A subscription is created as Pending** and is never marked Active by the admin API. Activation comes only from the verified webhook (built later). `POST /admin/subscriptions/:uuid/sync` refreshes one subscription from Razorpay by hand until then.
- **Cancellation is always at the end of the billing period.** A subscription that never started has no period, and Razorpay refuses "end of period" for it, so it is cancelled at once. We never mark one Cancelled on our side while Razorpay may still charge it.
- **Status mapping:** created and authenticated -> Pending; active -> Active; pending -> Past due; halted and paused -> Suspended; cancelled -> Cancelled; completed and expired -> Expired.
- **Billing numbers live in platform settings**, not in code: GST rate and number, invoice prefix, company name and address, SAC code, grace days, and the automatic-charge note `billing.max_auto_charge_rupees` (banks limit automatic debit, about 15,000 rupees per charge; the plan form only warns).
- `fail_existing` for a Razorpay customer must be the string `"0"`; a number is ignored.

## School users, tenant isolation and school auth
- **School-owned models use `defineTenantModel`** (not `defineModel`). They get `client_id` automatically, are scoped on every query, and throw outside a school context. Never pass `client_id` from a request; never read it from `req.body`, `req.query` or headers. The school is `req.client` (set by `resolveClient`).
- Code that runs before the school is known wraps the lookup in `context.runWithoutTenant('why this is needed', fn)` and then continues inside `context.run(user.clientId, ...)`. Do not use it for anything else.
- Banned on school-owned models: raw SQL, `sequelize.query`, `unscoped()`, `upsert`, `increment`, `decrement`. Platform models (clients, plans, subscriptions, settings) are not tenant models, so filter them by `req.client.id` yourself.
- `users.email` is unique across ALL schools (no database constraint; use `UserDirectory.emailExists`). Only `email` is required in `users`.
- Permissions for school users live in `config/schoolPermissions.js`; `requirePermission` works for both admins and school users. Hiding a menu is never enough.
- Test every new school endpoint for cross-school access: a guessed uuid of another school's record must answer 404.
- The tests are `school-auth-test.mjs` (HTTP + models) and an offline check of the context and hooks; run them after migrating.
## Invoice PDFs and refunds
- **Invoice PDF:** `GET /admin/invoices/:uuid/pdf` (permission `billing.invoices_download`, rate limited) makes the PDF on the first download, keeps it in private storage (file type `invoicePdf`, name saved in `invoices.pdf_file`) and streams the same file afterwards. `?refresh=1` rebuilds it and is for the master admin only. Footer, terms and SAC code come from Settings (`billing.invoice_footer`, `billing.invoice_terms`, `billing.sac_code`). Built-in PDF fonts have no rupee sign, so amounts print as "Rs.". Every download is audited (`invoice.pdf_downloaded`).
- **Refund:** `POST /admin/payments/:uuid/refund` (permission `billing.refund`) with `amountPaise` (optional, default the whole balance), `reason` (one of Settings `billing.refund_reasons`, `GET /admin/payments/refund-options`), `note`, `cancelSubscription`. Only paid or partly refunded payments; the amount must be between 1 paise and the balance. The payment row is locked while it runs. A Razorpay payment is refunded at Razorpay first and nothing is written if Razorpay refuses; a payment without a Razorpay payment id (recorded by staff) is only recorded. The refunded total is read back from Razorpay, so the later `refund.processed` webhook (which stores the same refund id and total) never counts it twice. Ticking `cancelSubscription` cancels at the END of the period only, after the refund is saved; if that step fails the refund stays and a `warning` is returned. Audit entry `payment.refunded`.

## Payment webhook (Razorpay)
- One endpoint, `POST /api/webhooks/payment`, unversioned. Its body is read RAW (`express.raw` for that path in `index.js`, registered BEFORE `express.json`) because the signature covers the exact bytes. Never add a body parser in front of it.
- Everything goes through `WebhookIngest.handle()`: signature check, then store + process inside a transaction under an advisory lock on the event id (duplicates are skipped in code, there is no unique constraint), the handler runs in a savepoint, a failure leaves the event as Failed (HTTP 500 so Razorpay retries). The dev replay (`POST /admin/dev/webhook-replay`, not mounted in production) calls the same function.
- Handlers live in `Services/V1/Common/Webhooks/handlers/` and are listed in `WebhookProcessor.js`. They are idempotent, tolerate out-of-order events, take a lock per subscription and never trust the browser.
- **Invoices:** one per captured payment, number `PREFIX-YYYY-NNNN` from the `invoice_counters` row of the (Indian) calendar year, taken in the same transaction under a lock, so numbers never repeat. Seller details come from the billing settings, buyer details from the school, both copied onto the invoice. The invoice total is what Razorpay actually charged. A plan that is not tax inclusive is charged price + GST (`Helpers/tax.js`, applied when the plan is synced to Razorpay), so the invoice shows the price as subtotal and the rest as GST; a tax-inclusive plan has its GST taken out of the total.
- A first activation runs `Provisioning.onSubscriptionActivated` (school Active, Principal login + welcome email). Its failures go to the audit log and never fail the webhook.

## Offline payments and the expiry job
- A school can pay outside Razorpay (bank transfer, cash, cheque, UPI). `POST /api/v1/admin/payments/offline` (`billing.record_payment`) records it: school, plan, amount in paise (GST is taken out of it by the plan's tax setting), payment date, method (from the `billing.offline_payment_methods` setting, with a built-in fallback list), reference, note and **valid until** (the admin decides the expiry, a calendar day in India, valid through the end of that day).
- It runs in one transaction: it finds or creates the school's **offline subscription** (`subscriptions.source = 2`, no Razorpay ids; a new payment renews the same row, a cancelled or expired one starts a new row), creates the payment (`payments.source = 2`, `recorded_by`, `reference`, `notes`), issues the invoice through the same `InvoiceIssuer` as online payments (shared gapless numbering and GST split; a zero amount gets no invoice), calls `Provisioning.onSubscriptionActivated` and audits `payment.recorded_offline`. A school with an open Razorpay subscription is refused (422).
- `POST /api/v1/admin/subscriptions/:uuid/expiry` (`subscriptions.manage`) changes an offline subscription's end date (audit `subscription.expiry_changed`; a later date reactivates a late or suspended school; refused for Razorpay subscriptions). Cancel on an offline subscription sets "ends at the period end" locally; sync is refused.
- `app/Jobs/SubscriptionExpiryJob.js` (started from `index.js`, once at startup and then every hour, with a Postgres advisory lock so two servers do not both work) only touches **offline** subscriptions: Active and past its end -> Past due (or Cancelled when set to end); Past due after `policy.grace_days` -> Suspended; Suspended after `policy.suspension_after_days` more days -> Expired (skipped when that setting is 0 or empty). Every step counts from the end of the paid period, so the result does not depend on when the job runs. Each change is audited as System with the school's id. `runOnce(now)` is a plain function so tests can pass a fake clock.
## Principal tools, notification bell and billing emails
- **Principal tools** (`Services/V1/Admin/PrincipalService.js`): staff with `schools.view` see a school's Principal; with `schools.edit` they can send a new welcome link or reset the password. A link is returned **once** in the response (`setPasswordUrl`) because email may not be set up yet; it is never stored readable (only its hash) and never audited. Resend switches off older unused links; reset also clears the old password, revokes every session and forces a new one. Both are audited with the school id and are rate limited. A school without a Principal answers 404 (the Principal is created when the first subscription becomes active).
- **Notification bell** (`Services/V1/Admin/NotificationService.js`): `GET /admin/notifications` is built from live data, nothing is stored per notification. New inquiries need `inquiries.view`, failed payments (last 14 days) and past due subscriptions need `billing.view`. The settings `notifications.show_new_inquiries` and `notifications.show_failed_payments` switch each source off; a missing setting counts as on (`Helpers/safeSetting.js` never throws for an unknown key). Unread = newer than `admin_users.last_seen_notifications_at`, set by `POST /admin/notifications/seen`.
- **Billing emails** (`Providers/BillingMailer.js`): a receipt after a new invoice and a payment-failed notice, sent through `Mailer` (Loops transactional ids from the settings `email.loops_tx_receipt` and `email.loops_tx_payment_failed`; printed in the terminal without Loops). Recipients are the school's contact email and, when different, the Principal's. They are queued by the webhook handlers (`handlers/billingMail.js`) on the OUTERMOST transaction, so they go out only after the whole event committed, once per invoice, and one notice per failure (60 minute cool-down because one failure arrives as two events). A mail problem never fails a webhook; real failures are audited (`billing_mail.*_failed`).

## Git
- Never commit `.env`, keys, dumps or uploads (see `.gitignore`).
- Commit `package-lock.json`.
- Keep commits focused. Update these docs in the same change as the code.

## Logging
`app/Helpers/logger.js` prints readable terminal output (`ok`, `info`, `warn`, `error`). Use it instead of raw `console.log`.

## Renewals
- The Renewals page (`GET /api/v1/admin/renewals/counts` and `GET /api/v1/admin/renewals?tab=`, permission `renewals.view`) shows four lists. All days come from Settings, none are in code: **due_soon** = Active and the next charge (or the end of the period when no charge is planned) is within `renewals.due_soon_days` or already passed; **payment_failed** = Past due; **in_grace** = Past due and still inside `policy.grace_days`, counted from `subscriptions.past_due_since`; **suspended** = Suspended.
- The lists use only the status and the dates, so they work for Razorpay subscriptions and for offline ones (no Razorpay ids) alike. `source` in a row is 1 for Razorpay and 2 for offline.
- `subscriptions.past_due_since` is kept by a `beforeSave` hook on the `Subscription` model: set when the status becomes Past due, cleared when it changes to anything else. Webhook handlers and manual syncs therefore need no extra code. Older Past due rows are filled from `updated_at` by the migration.
