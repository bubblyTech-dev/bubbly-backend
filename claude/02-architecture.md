# 02. Architecture

## Tech stack
| Need | Choice |
|---|---|
| Runtime / framework | Node.js (v24 LTS) + Express 5, plain JavaScript (CommonJS) |
| Database | PostgreSQL |
| ORM / migrations | Sequelize 6 + `sequelize-cli` (never `sync()` in production) |
| Imports | `module-alias` (`@app`, `@config`, `@routes`, `@database`) |
| Validation | Our own Laravel-style Request classes, **no Zod/Joi** (planned) |
| Auth | JWT access + refresh tokens, bcrypt/argon2 (planned) |
| Background jobs | BullMQ + Redis (planned) |
| Payments | Razorpay (INR, GST), signature-verified webhooks (planned) |
| Files | S3-compatible storage (planned) |
| Hosting | Hostinger VPS (planned) |

## Multi-tenancy: `client_id`
All schools share one database. A **client = one preschool** (the customer who buys a plan).

- Every school-owned table has a **`client_id`** column. Use this exact name everywhere; never `tenant_id`.
- Platform-level tables (plans, platform admin users, platform audit logs) have **no** `client_id`.
- `client_id` comes **only from the logged-in user's database row** (found through the session in the access token), never from the request body, query, headers or URL.
- **How it is enforced (built):** `app/Helpers/context.js` holds the current school in an `AsyncLocalStorage`. The `resolveClient` middleware starts it for the whole request. School-owned models are defined with `defineTenantModel` (`app/Models/TenantModel.js`), which adds `client_id` to every find, count, bulk update, bulk destroy (and to included tenant models), fills `client_id` on create, refuses to change it, and **throws when no school context is set**.
- The only way around it is `context.runWithoutTenant(reason, fn)`, used for the few lookups that happen before the school is known (login by email, refresh token, reset link, "is this email taken"). Every use needs a written reason and a code review.
- Raw queries, `sequelize.query`, `unscoped()`, `upsert`, `increment` and `decrement` are banned on school-owned models (the last four throw).
- Subscription state, plans and the other platform tables are not tenant models; code that reads them for a school passes `req.client.id` explicitly.
- Postgres Row-Level Security may be added later as a second safety net, through a migration.

**The rule that matters most:** a user from one school must never be able to read, change, search or export another school's data, even by guessing IDs.

## School login and access (built)
- School users (`users`: Principal, Teacher, Student) log in at `/api/v1/user/auth`. The email is the login and is unique across all schools (checked in code). Access token: JWT, audience `bubbly-school`, holds only the user uuid and the session uuid; refresh token: random, hashed in `user_sessions`, httpOnly cookie `bubbly_rt` (path `/api/v1/user/auth`), rotated on every refresh. An admin token never works here and the other way round.
- The `user` middleware group runs in this order: `authenticate` (token, live session, active user) -> `resolveClient` (school must be Active, starts the tenant context) -> `checkSubscription` (the school's subscription must be Active, or Past due inside `policy.grace_days`; otherwise 402 `SUBSCRIPTION_INACTIVE`). `requireModule('key')` then checks the plan, `requireRole(...)` and `requirePermission(...)` check the person.
- `/user/auth/me` and `/user/auth/change-password` sit outside the group (they use `authenticate.allowPasswordChange` + `resolveClient`), so everyone can still see who they are and why access is blocked. The Principal may also open `/user/subscription` while payment is overdue.
- Roles map to permission keys in `config/schoolPermissions.js`. A new Principal is created without a password by `PrincipalProvisioner` and sets it from an emailed welcome link (`/user/auth/reset-password`).

## Request flow
```
route -> middleware group -> (extra middleware) -> controller -> service -> model
```
- **Routes** only wire URLs to controllers and middleware.
- **Middleware** does auth, client resolution, subscription/plan checks, permission checks, validation.
- **Controllers** stay thin: read input, call a service, return a response.
- **Services** hold business logic.
- **Models** talk to the database.

## Subscriptions and entitlements (planned)
- Tables for plans, plan entitlements (modules + limits), subscriptions, payments and webhook events.
- Subscription state changes only on **verified, idempotent** payment webhooks.
- Plan limits and enabled modules are enforced **in the backend** (middleware like `requireModule('fees')`), never only by hiding menus.
- Past-due / cancelled / suspended behaviour (grace period, read-only mode) is an open business decision.

## Security rules (non-negotiable)
- Hash passwords; validate all input; rate-limit sensitive routes; HTTPS in production.
- Never store raw card data; use the gateway's hosted checkout and verify webhook signatures.
- Audit log (who, what, when, which record) for: plan, permission and client-status changes, attendance corrections, fees, leave decisions, and any support access to a school's data.
- No secrets in git. `.env` is ignored; `.env.example` lists the variable names only.

## API versioning
- All API routes live under `/api/v1/...`. Folders are `V1/` (later `V2/`).
- Inside every version there are three groups: **Admin**, **User**, **Common**.
- **Versioned layers:** Controllers, Services, Requests, Resources, routes.
- **Shared, unversioned:** Rules, Middleware, Models, Jobs, Mail, Providers, Helpers, migrations.
- To add V2, copy only what changes. V1 must not break once clients use it.
- The payment webhook URL is **not** versioned (the gateway stores it): `/api/webhooks/payment` (planned).

## Database conventions (decided 2026-10-25)
- **Two kinds of login tables, kept separate.** `admin_users` (platform owner and staff) has no `client_id`. `users` (principals, teachers, students, later guardians) always has `client_id`. Admin staff get permissions directly (`admin_permissions`, `admin_user_permissions`); the master admin (`admin_users.type` = 1) always has every permission and the code never checks the table for them. School users use `roles` and `permissions`.
- **Every table has two keys.** `id` (internal auto-increment, used for joins and foreign keys) and `uuid` (public identifier). The API, routes and the Admin and School apps use **only the uuid**. A shared backend helper resolves a reference to the internal row so controllers and services never deal with the difference. Numeric ids are never exposed in URLs.
- **Money** is stored as whole numbers in paise plus a currency code (INR). Timestamps are UTC; each school has a timezone.
- **Soft delete** (`deleted_at`) for people and records. The audit log is append-only.
- **Plan versions:** a subscription points to a frozen plan version.
- **Razorpay:** plans, customers, subscriptions, orders and payments keep their Razorpay ids; every webhook is verified and stored in `webhook_events`; the event id is checked in code (inside a transaction) so repeats are ignored. There are no unique constraints in migrations (see conventions).
- **GST:** schools store state and an optional GSTIN; invoices record the tax split and use a numbered series per financial year.
- **Policy settings** (grace days, suspension days, read-only on past-due, retention) live in platform settings, editable in the Admin app, not in code.
- **Email** goes through Loops.so, so there is no email-templates table. The Loops transactional ids are kept in platform settings and the API key only in `.env`. Sent emails are logged in `email_logs`.
- **School branding:** the principal chooses the school's theme and logo in the School app (`client_branding`: display name, logo file, theme preset). Minimal for now; more options later.
- **Renewals:** each subscription has a next renewal date. `subscription_renewals` records every renewal (due date, amount, auto or manual, status, invoice) and `renewal_reminders` records reminders sent (days before). A daily background job finds upcoming and overdue renewals, and the Admin app has a Renewals screen.
