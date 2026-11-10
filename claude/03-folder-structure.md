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
├── config/                  app.js, database.js, auth.js, permissions.js, files.js (file types, rules, disks), plans.js (plan limit keys, billing intervals)
├── config/                  app.js, database.js, auth.js, permissions.js, files.js (file types, rules, disks), settings.js (platform settings: keys, defaults, limits)
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
`app/Helpers/audit.js` writes audit rows (`Audit.log` inside the same transaction as the change) and `app/Helpers/pagination.js` reads `page` and `perPage`. `app/Services/V1/Admin/AdminUserService.js` manages staff (Users & Access) and `AuditLogService.js` reads the audit log.

`app/Helpers/context.js` holds the current school for the request and `app/Models/TenantModel.js` defines school-owned models (always scoped by `client_id`). School auth lives in `app/Services/V1/User/AuthService.js`; shared pieces are `app/Services/V1/Common/{UserDirectory,SubscriptionAccess,PrincipalProvisioner}.js`; role permissions are in `config/schoolPermissions.js`.

`app/Helpers/files.js` is the one place for file work; `app/Providers/Storage/` holds the disk drivers (`local` now, `s3` later). `app/Resources/Resource.js` is the base class for API output.

Announcements: `Models/Announcement.js` + `AnnouncementTarget.js`, `Services/V1/Admin/AnnouncementService.js` (and `AnnouncementTargetResolver.js`), `Controllers/V1/{Admin,Common}/AnnouncementController.js`, `Resources/V1/Admin/AnnouncementResource.js`, `Resources/V1/Common/PublicAnnouncementResource.js`, routes `Admin/announcements.js` and `Common/announcements.js`.

Invoice PDFs and refunds: `Services/V1/Admin/InvoicePdfService.js` (builds the PDF with pdfkit, keeps it through the Files storage layer as file type `invoicePdf`, remembers the name in `invoices.pdf_file`) and `PaymentRefundService.js` (refunds, offline refunds, optional cancel at period end), both reached from `BillingController` / `routes/V1/Admin/billing.js`; `Request` `Requests/V1/Admin/Billing/RefundPaymentRequest.js`. No new tables or migrations.

Plan features: model `PlanFeature` (table `plan_features`, migration `...000220`), written by `Services/V1/Admin/PlanService.js` together with the plan.

Payment gateway: `app/Services/V1/Common/PaymentGateway/RazorpayService.js` holds every Razorpay call (customers, plans, subscriptions, invoices, payments, refunds, signature checks); nothing else talks to Razorpay. `app/Services/V1/Common/Webhooks/` holds the webhook processing (`WebhookIngest`, `WebhookProcessor`, `InvoiceIssuer`, `handlers/`); its README explains the flow. The endpoint is `Controllers/V1/Common/WebhookController.js` + `routes/webhooks.js` (mounted at `/api/webhooks`, not versioned, body read raw in `index.js`). `Services/V1/Common/Provisioning.js` runs on a school's first activation. Admin side: `Services/V1/Admin/BillingQueryService.js`, `Controllers/V1/Admin/BillingController.js`, `routes/V1/Admin/billing.js` (webhook events, payments, invoices) and the development-only `routes/V1/Admin/dev.js` (webhook replay). Money maths in `app/Helpers/tax.js`. Models `InvoiceCounter` (migration `...000260`). `config/payment.js` reads the keys from `.env`. Admin side: `Services/V1/Admin/GatewaySyncService.js` (plan and customer sync), `SubscriptionService.js`, `Controllers/V1/Admin/SubscriptionController.js`, `routes/V1/Admin/subscriptions.js` (plus two routes in `schools.js`), `Resources/V1/Admin/SubscriptionResource.js`. Models `Subscription`, `Payment`, `Invoice`, `WebhookEvent`; migrations `...000210` to `...000214`. Renewals: `Services/V1/Admin/RenewalService.js`, `Controllers/V1/Admin/RenewalController.js`, `routes/V1/Admin/renewals.js`, `Requests/V1/Admin/Renewals/ListRenewalsRequest.js`, `Resources/V1/Admin/RenewalResource.js`; migration `...000280` adds `subscriptions.past_due_since`.

Versioned (`V1/...`): Controllers, Services, Requests, Resources, routes.
Not versioned: Rules, Middleware, Models, Jobs, Mail, Providers, Helpers, migrations.

## What `Admin`, `User`, `Common` mean
- **Admin:** Super Admin and platform staff endpoints (`/api/v1/admin/...`).
- **User:** principal, teacher and student endpoints (`/api/v1/user/...`), always scoped to one `client_id`.
- **Common:** public site (plans, signup, contact), public login, webhooks, anything shared by both (`/api/v1/common/...`).

## Temporary files (delete later)
`routes/V1/*/ping.js` and the `ping-solo` route in `routes/V1/User/index.js` are demos for the middleware order. Remove them once real routes exist.

## Inquiries (support inbox)
Public form: `routes/V1/Common/inquiries.js` -> `Controllers/V1/Common/InquiryController.js` -> `Services/V1/Common/InquiryService.js`. Admin side: `routes/V1/Admin/inquiries.js`, `Controllers/V1/Admin/InquiryController.js`, `Services/V1/Admin/InquiryService.js`, requests in `Requests/V1/{Admin,Common}/Inquiries/`, resources `InquiryResource` and `InquiryNoteResource`. Models `Inquiry` and `InquiryNote`; migrations `...000170` and `...000171`.
