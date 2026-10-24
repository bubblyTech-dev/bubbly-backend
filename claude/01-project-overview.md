# 01. Project Overview

## What we are building
A **subscription-based, multi-tenant SaaS for preschools** (Nursery, Jr. KG, Sr. KG). A preschool buys a plan, gets its own isolated workspace, and runs daily school operations in it. Think "Netflix for school management".

This repository is the **backend API** only (Node.js + Express + PostgreSQL). The frontends live in a separate repository.

## The three surfaces
1. **Public website + School app** (one React app): marketing pages, pricing, signup, checkout, then the school workspace under `/app`.
2. **Super Admin app** (separate React app): internal tool for the SaaS owner.
3. **This API**: shared by both frontends.

## Roles and who logs in where
| Role | Where | Scope |
|---|---|---|
| Visitor | Public pages (no login) | Features, pricing, signup, contact |
| Platform Super Admin and platform staff | Super Admin app | All schools; sensitive access is logged |
| Principal / Preschool Owner | School app | Their own school only |
| Teacher | School app | Their assigned classes |
| Student | School app (only if enabled; small children may not log in) | Their own data |
| Parent / Guardian | Not in Phase 1 | Deferred |

In the API these map to the route groups **Admin** (platform) and **User** (principal, teacher, student). **Common** holds public, signup/login-for-public and webhook routes.

## Buy flow
1. A school opens the website, compares plans, signs up.
2. Owner picks a plan and pays through the payment gateway checkout.
3. The gateway sends a **verified webhook** (processed idempotently).
4. Backend creates the client (school), the Principal account, marks the subscription ACTIVE and applies the plan's modules and limits.
5. Owner is redirected into the workspace and does onboarding (school profile, academic year, classes, teachers, students).

The workspace is activated **only by the verified webhook**, never by the browser redirect.

Subscription states: `pending`, `active`, `past_due`, `cancelled`, `expired`, `suspended`.

## Modules (Phase 1)
- **Super Admin:** dashboard, schools (clients), plans and entitlements, billing and webhooks, platform users and permissions, support inquiries, audit logs.
- **Principal:** dashboard, school settings, students, teachers, classes/sections/subjects/academic years, attendance oversight, homework oversight, timetable and calendar, announcements, leave approval, fees (offline payments, receipts, reports), admissions (if confirmed), reports and exports, subscription view.
- **Teacher:** classes, timetable, attendance, homework, announcements, own leave, optional chat.
- **Student (if enabled):** homework, timetable, announcements, optional attendance, leave and fees.

## Out of scope for Phase 1
Native mobile apps, parent portal, transport, library, payroll, inventory, biometric attendance, multi-branch, exams and report cards, parent online fee payment, free trials, coupons, proration, plan switching, automated dunning, email/SMS/WhatsApp.

## Open decisions
- Payment gateway, country and currency
- Plan names, prices, billing intervals, taxes and limits
- Grace period, suspension and data-retention policy after failed payment or cancellation
- Student accounts: yes or no
- Who creates teacher and student accounts; is CSV import needed
- Admissions, fee receipts and report exports in Phase 1?
- Production hosting details and expected volumes
