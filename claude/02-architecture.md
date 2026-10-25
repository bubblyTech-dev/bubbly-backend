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
- `client_id` comes **only from the logged-in user's token**, never from the request body, query or URL.
- A shared base model adds a default scope (`WHERE client_id = <current>`) and a create hook that fills `client_id` (planned: `BaseModel`).
- Raw queries and `unscoped()` are banned outside one small reviewed helper.
- Postgres Row-Level Security may be added later as a second safety net, through a migration.

**The rule that matters most:** a user from one school must never be able to read, change, search or export another school's data, even by guessing IDs.

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
