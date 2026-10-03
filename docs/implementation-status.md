# Implementation status

## Foundation

T001 is implemented: Next.js App Router, strict TypeScript, Tailwind v4, shared shadcn-compatible button, pinned dependencies, lockfile, runtime configuration, CI and setup documentation.

Supabase and backend work are deferred at the user's request. The current UI is an interactive prototype, not completion of the corresponding production milestones.

## Interactive demo

- Responsive dashboard and navigation, with counts derived from current demo state.
- Patient directory, name/phone/ID search, registration, profile dialog and visible medical alerts. Shared family phones are allowed.
- Daily appointment schedule, date navigation, dentist/status filters and booking in 30-minute slots. Dentist and patient conflicts are rejected in memory.
- Appointment arrival and cancellation actions.
- Arrived appointment → visit editor, with visible patient alert, presenting concern, findings, plan and alert-review checkbox.
- Proposed treatment items with optional adult FDI tooth reference and proposed/accepted/completed states.
- Draft notes survive client navigation. Demo completion requires concern, findings and alert review; it locks the note and updates the appointment/dashboard.
- Empty, missing-visit and invalid-action states.

Fixtures and demo types live in `src/lib/demo/data.ts`. In-memory state and screens live in `src/components/demo/`. All edits reset on refresh. There is no browser-storage persistence, database, identity verification, signature, immutable audit, real payment collection or external communication.

## Verification performed

- ESLint passed with zero warnings.
- Route generation and TypeScript passed.
- Webpack production build passed, including `/`, `/patients`, `/appointments` and `/visits/[visitId]`.
- Browser: searched a patient, registered Alex Demo, rejected a conflicting booking, booked another slot, navigated to the schedule and checked in the new patient.
- Browser: opened Noor Ahmed's visit with its alert visible, rejected incomplete completion, entered fictional notes, added Filling / tooth 16, changed it to Accepted, navigated away/back and verified draft retention.
- Browser: completed the visit, verified disabled note/treatment fields, and confirmed dashboard waiting count changed from 2 to 1 and completed count from 1 to 2.
- Visual checks: desktop visit columns at 1440px and stacked mobile layout at 390px.
- Browser form actions were exercised with keyboard activation. No durable automated browser regression suite has been added yet.

CI configuration is written but has not run remotely. Previous T001 build was also verified on pinned Node 24.21.0; the latest local checks ran on the host Node 26.3.0. Tooling compatibility notes are in `architecture/versions.md`.

## Remaining work

- Production milestones remain open: M00 clinic decisions, M01 staging/database, M02 identity/authorization/audit, and production M03–M06 workflows.
- Connect Supabase when requested, through authorized services and scoped repositories from the technical plan.
- Scheduling still needs full day/week resource grids, availability rules, rescheduling, concurrency controls and server validation.
- Clinical work still needs approved templates, full tooth chart, revisions/amendments, authorization and durable storage.
- Production treatment/billing still needs approved prices, estimate versions, server transactions, refunds/credits, permissions and immutable receipts.

This prototype is for fictional walkthroughs only. It is not ready for real clinical use.

## Demo billing added

- Billing overview, per-patient accounts and account links from visits and the patient directory.
- Completed visits expose accepted/completed treatment items for one-time charge posting with reviewed demo PKR amounts.
- Exact integer-paisa totals, full/partial payments, oldest-first charge allocation, balance and overpayment checks.
- Cash/card/bank-transfer labels record demo methods only. No actual collection occurs.
- Receipt history, fixed receipt snapshots, printable receipt page and explicit demo watermark.
- Amina Shah's completed synthetic consultation seeds an eligible item, but no financial entries are automatically posted.

Verification: `pnpm check` passes, including six Node billing rule tests and all routes in the production build. Browser walkthrough posted PKR 1,500.00, rejected PKR 1,600.00, recorded PKR 500.25 leaving PKR 999.75, and settled PKR 999.75 by a second demo payment. Final balance is zero and the payment form disables. Reopening the first receipt preserves its original PKR 999.75 balance snapshot. Receipt layout inspected at desktop and mobile widths. The print button was activated; the in-app browser did not expose a print preview, so physical/PDF output remains unverified.

The demo remains in-memory and resets on refresh. Production M07 is not complete.

## Demo expenses and daily closing added

- Paid expense register with description, category, payment method and amount; category/method filters and cash/noncash totals.
- Closing calculates opening cash + cash patient payments − cash expenses; card and bank entries remain separate.
- Opening/count values allow zero; cash differences require an explanation; negative expected cash prevents closing.
- Closed-day snapshot is read-only. Synchronous session guards reject further charges, payments and expenses for that day; corresponding UI controls are disabled.
- One fixed day, no carry-forward/reopening, approval matrix, unpaid liabilities, attachments, refunds or cash transfers. M08 production acceptance remains open.

Verification: lint/type/build plus 12 rule tests passed. Browser recorded PKR 250.25 cash and PKR 100.00 bank expenses, posted a consultation and collected PKR 500.25 cash. With PKR 1,000.00 opening cash, closing showed PKR 1,250.00 expected; PKR 1,240.00 counted required a shortage note. After closing, expense and payment controls were verified disabled; the snapshot persisted across navigation. Desktop and 390px mobile layouts inspected.

## T002/T003 — Local database preparation

At the user's request, prepare locally before creating a Supabase project. Added exact Drizzle/Postgres.js/Zod dependencies, validated configuration with redacted errors, `.env.example`, lazy server-only runtime client, Drizzle schema and two tracked migrations.

The five foundation tables are clinics, branches, app_users, memberships and membership_branches. Composite keys reject cross-clinic branch membership. The restricted runtime role has SELECT only at this stage; no authorization or write workflows are exposed. Auth UUIDs are references for future verified provisioning, not authentication.

Added optional loopback-only Docker Compose PostgreSQL, migration serialization, local runtime credential setup, a rollback-only real PostgreSQL verification command and CI database service/check steps. Commands refuse remote write targets. No Docker/PostgreSQL executable is available on this host; no database was started, migration applied or real PostgreSQL check run. CI execution also remains unverified.

Offline migration generation succeeded. Environment rules add four tests to the existing twelve. The demo remains unchanged and resets on refresh; database-backed patient/appointment screens, staff login, scoped authorization and audit are still pending.

## Local PostgreSQL execution and first protected patient workflow — 2026-10-01

This supersedes the earlier note that PostgreSQL was unavailable. Installed PostgreSQL 17.11 and started an isolated project cluster on loopback port 54329 with generated SCRAM credentials in ignored `.env.local`. Applied migrations 0000–0003 and verified the restricted runtime login and cross-clinic constraints.

Added permission/role/grant tables, append-only audit events and patient demographics. Patient services enforce active user/membership/branch access and read/write permission, scope every query to the clinic, validate demographic input, detect stale edits and transactionally audit changes. Real PostgreSQL checks cover these paths, including revoked permissions, second-clinic isolation and rollback when an audit write fails.

Added Supabase server-verified identity, sign-in/sign-out routes, authorized scope discovery and protected patient search/create/update APIs. `/staff` provides a separate sign-in, scope selection and demographic directory/edit form; missing Auth configuration produces a setup state. Existing demo workflows remain synthetic/in-memory.

Production acceptance remains open: actual Supabase sign-in and signed-in browser flows have not been tested; staff provisioning/admin, read auditing, rate-limit hardening and remaining durable workflows are pending. No real patient data has been entered. No cloud project or deployment was created.

Additional acceptance evidence: `GET /api/v1/audit-events` now requires `audit.read` and scopes events to the selected clinic and branch. Database integration checks deny audit reads without the permission and reject audit update/truncate even under the local migration role, in addition to runtime delete denial. Lint, TypeScript, all 16 existing tests and production build passed. Automated visual verification was blocked by the browser tool's URL policy; the setup screen and authenticated UI remain visually unverified in this run.

Registration now uses a clinic-scoped unique operation key and payload hash. Replays return the existing record without duplicate audit events; mismatched payloads return 409. Migration 0004 safely backfills older rows. Real PostgreSQL replay checks pass, including replay after a later edit.

HTTP checks against the local production server also passed: unconfigured patient/session/audit endpoints return 503 with no records and private/no-store headers; a foreign-origin mutation returns 403. Run `node --experimental-strip-types scripts/verify-api.ts` only against a local preview with Auth still unconfigured.

## Persistent branch appointments — 2026-10-01

Added appointments schema/migration 0005, scoped list/book/status APIs and a staff calendar below the patient directory. Bookings use explicit timestamp offsets; UI labels device timezone. This first slice is one calendar per branch, with no overlapping active bookings. Adjacent slots are allowed; cancellation frees a slot. Arrival and cancellation are terminal in this slice; clinical completion/rescheduling are deferred.

Commands validate patient clinic, require appointment permission plus demographic read, serialize branch mutations using a transaction advisory lock, reject stale status versions, deduplicate retries and audit atomically. Tests use rollback-only fixtures for booking, overlap/adjacency, replay mismatch, invalid ranges, missing patients, status conflicts, revoked grants and audit counts. Separate-connection race testing and authenticated visual acceptance remain pending.

Existing staff grants were preserved. New appointment.read/write permissions need explicit approval before running scripts/grant-local-appointments.ts with the verified Auth UUID. Dentist/chair calendars, working hours, availability, overrides, full booking history UI and rescheduling remain M04 work.

## Main app switched from demo to saved records — 2026-10-01

All app routes now mount the authenticated clinic shell. Overview reads patient counts and permission-gated branch appointment counts from PostgreSQL; Patients reads/searches/creates/edits saved demographics with pagination; Appointments mounts the saved branch calendar. Clinic/branch labels come from active memberships, and session scope persists in the browser session. The existing /staff link redirects to Patients. UI controls reflect permissions; server services remain authoritative.

Removed demo providers and demo component imports from app routes. Billing, expenses, closing, visits, accounts and receipts show explicit pending-workflow states because their durable backends are not yet implemented. No synthetic patients, dentist roster, financial totals or receipts are presented as live data. Historical demo code/rule tests are retained as development reference. Existing database records, including the user-created Test Patient, are preserved.

Appointment permissions have not been added to the initial user; the calendar shows an access-required state until explicit approval. This change switches the available application data source; it does not complete pending clinical/financial milestones. Automated visual verification remains unavailable due to the earlier local-preview browser-policy block.


### 2026-10-04 — Persistent paid expenses

- `/expenses` now uses authenticated local PostgreSQL records. `/api/v1/expenses` supports recording and listing a selected branch/date with pagination and full-day total/cash total.
- PKR amounts are parsed into integer paisa. Categories and payment methods are validated. Operation keys serialize concurrent retries and reject mismatched payloads.
- Expenses and audit events commit together. Expense rows are append-only at the database level, including administrator update/delete/truncate protection. Corrections/reversals and daily closing are still pending.
- Migration 0006 adds the table, restricted runtime privileges and expense permission definitions. No real account permissions or expense records are added by the migration.
- `scripts/grant-local-expenses.ts` is prepared for explicit approval of local expense.read/write access; it has not been run.
- Rollback-only integration checks cover exact amounts, replay conflicts, branch/clinic separation, permission denial, audit rollback and immutable rows. Unit validation runs in `pnpm check` and therefore CI.
- App records remain in local PostgreSQL; Supabase provides staff authentication. Billing and clinical workflows still need persistent implementations. Browser visual checks remain unavailable due to the previously reported URL-policy rejection.
