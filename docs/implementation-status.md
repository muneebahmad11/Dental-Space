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


## Repository, WhatsApp and persistent finance — 2026-10-04

Initialized Git on main and connected origin to `muneebahmad11/Dental-Space`. The baseline commit is local; initial push failed because existing Git credentials were invalid. GitHub CLI browser authorization is pending. No credentials/local database files are tracked.

Added Meta Cloud API template sending, staff-recorded consent, scoped durable jobs, worker leases/attempt history, fresh authorization/phone/consent/template/appointment rechecks, bounded rate-limit retries, review for ambiguous sends, signed webhooks, account/phone binding, delivery receipt deduplication, monotonic delivery and patient opt-out suppression. A Communications screen manages preferences, configured templates, schedule times, message status and cancellation. Meta remains disabled by default; user will configure the account later. Live messages/HTTPS callbacks remain unverified.

Replaced pending Billing/Accounts/Receipts routes with saved manual charges, partial payments, oldest-first allocations, overpayment guards, immutable receipt snapshots, partial refunds/allocation reversals and printable refund confirmations. Currency is PKR; this records payments/returns and does not perform bank/card collection. Added daily closing drafts, fresh cash/refund/expense reconciliation, variance notes, separate staff approval and immutable snapshots; approved business days reject new payments/refunds/paid expenses. Closing and posting use the same transaction advisory lock. Existing operation replays still return their prior result after closing.

Rollback-only PostgreSQL evidence covers authorization/scope isolation, retries/conflicts, exact balances, refund limits, immutable snapshots, audit-failure rollback, dual approval, changed cash totals and closed-day guards. Messaging unit/integration tests never use a real provider. All new permission definitions are separate from actual account grants; no initial-user privileges were expanded.

Manual charge credits/deposits/treatment links, clinical workflows, files/lab/inventory, full reports, offline/recovery, portal and automated reminder rules remain open in `milestones.md`. Generated migration 0011 was corrected before successful application to create its referenced unique key before the refund FK. Visual acceptance remains blocked by the previously reported preview URL policy.


## Durable clinical visits — 2026-10-04

Added saved walk-in/arrived-appointment visits, note editing with expected versions, clinician-author checks, immutable final revisions and reasoned signed amendments. Patient clinical read permission is required independently from demographics; no clinical signing access was granted to the initial user. `/clinical` lists branch visits and starts walk-in drafts; `/visits/:id` edits or reviews notes and signed revision history. Complaint, assessment and treatment text must be completed before signing; field policy still needs clinic/dentist acceptance. Draft saving is explicit, with no claim of offline recovery/autosave. Templates, alerts/chart, treatment plans and appointment completion links remain open.


Clinical PostgreSQL checks passed for author/version/scope denial, finalization/amendment replay, preservation of the original note, atomic audit failure rollback, revoked clinical read and immutable signed projection. Migrations 0012–0014 protect webhook receipt metadata, visit authorship and scoped appointment references. `scripts/grant-local-access.ts` prepares precise audited local grants only after approval; it has not been run.


Final local verification for this increment: lint/TypeScript and production build passed; all 26 unit checks passed; database foundation, patients/appointments/expenses, finance/refunds/closing, messaging and clinical rollback suites passed. Anonymous HTTP checks are run against the restarted preview. GitHub device authorization expired before approval; publishing and remote CI are not yet verified. Account permission grants, signed-in visual journeys, physical printing and live Meta delivery remain pending.


## Financial reporting and repository publication — 2026-10-04

GitHub browser authorization completed and the persistent workflow commit was pushed to main; its remote CI passed. The user requested excluding the environment template as well: `.env.example` was removed from the current branch and all `.env*` files are ignored. Real `.env.local` was never tracked.

Added `/reports` and a private financial report API using billing/expense read permissions and a repeatable-read snapshot. Inclusive ranges are capped at 366 days. Saved payments, refunds and paid expenses reconcile by date and payment method with exact integer totals. No patient details or account grants are included. This is recorded money movement, not profit or bank reconciliation. Rollback-only database checks cover totals, method subtotals, empty ranges, branch isolation and revoked access.

Validation: `pnpm check` passed lint, TypeScript, 28 unit tests and production build. `pnpm db:verify-finance` passed with report assertions and rolled back all synthetic records. Browser visual acceptance remains unverified.


## Treatment plans and accepted estimate versions — 2026-10-04

Added branch-scoped treatment plans with stable item IDs, optional tooth/site, integer quantities and exact PKR pricing. Create/save writes preserve immutable estimate snapshots. Acceptance binds to the current version and records staff identity plus named patient/representative agreement evidence. Accepted plans are locked at the service and database layers. Draft changes have optimistic version checks; operation retries retain their original results. All writes are audited transactionally. Migrations define plan read/write/accept privileges without assigning any actual account grants.

Added the `/plans` editor/history and private authenticated APIs. Rollback-only database checks passed for exact totals, branch/clinic isolation, stale versions, idempotent requests, immutable acceptance, audit failure rollback and permission revocation. Treatment completion, remaining-work projection, superseding accepted estimates and billing links remain open. The financial reporting commit's GitHub CI passed.

Validation: `pnpm check` passed lint, TypeScript, 30 unit tests and production build; `pnpm db:verify` and `pnpm db:verify-plans` passed. Browser visual acceptance remains unverified.


## Treatment progress and accepted-price billing — 2026-10-05

Completed the interrupted treatment workflow: immutable partial completion records, remaining quantities, accepted-estimate item/version binding and separate linked charge posting. Completion requires plan.complete; billing requires charge.post. Both require scoped clinical/plan/demographic reads. No actual account privileges were changed. Database guards prevent over-completion and reject links with amounts different from accepted quantity pricing. Charge/link/audit writes share an outer transaction and preserve existing closed-day billing guards.

Local rollback-only plan tests passed for partial progress, exact locked-price charges, duplicate and excess-quantity rejection, branch isolation, audit rollback and revoked access. Completion corrections, clinical-visit linkage and independent-connection concurrency evidence remain open.

Validation: lint, TypeScript, 31 unit tests and production build passed. Expanded rollback-only plan checks also verify direct database rejection of excessive quantities and incorrect linked prices. Browser visual acceptance remains unverified.


## Follow-ups and recalls — 2026-10-08

Added durable branch follow-ups with named/custom types, preventive recall due dates, assignment to eligible active branch staff, clinic-date today/upcoming/overdue filters, pagination and all six statuses. Manual contact entries record channel/outcome/note and attributed time; they do not send messages or automatically mark care completed. Terminal Completed/Closed records cannot be reopened in this slice. Later care requires a new record.

Added `/follow-ups`, private authenticated APIs, clinical-visit links, immutable versioned history and audit. A dedicated booking command calls the existing scheduling service inside the same outer transaction and links the resulting appointment. Conflicts or audit failures roll back both records. Existing same-patient/branch bookings can be linked through the status API. A cancelled booking does not automatically complete or close care.

Read requires followup.read plus demographic and clinical read; write additionally requires followup.write. Booking also requires appointment read/write. New permissions were defined, without assigning any real account access. No provider message or automatic reminder/recall job is created. Unified patient timeline, recurring rules, broader communications history and staff/browser acceptance remain open.

Validation: `pnpm check` passed lint, TypeScript, 34 unit tests and production build. Rollback-only `pnpm db:verify-follow-ups` passed, including explicit completion/closure and terminal protections. Browser visual/staff acceptance remains unverified. The dated audit document records the pre-follow-up commit and is retained as a historical snapshot, not the updated current task count.


## Unified patient timeline — 2026-10-08

Added a patient-directory Timeline link and branch-scoped chronological activity from existing persisted sources: patient registration, appointment audits, visit draft/sign/amend activity, estimate versions/acceptance/completion, charges/payments/receipt links/refunds, follow-up history and WhatsApp queue/provider/cancellation events. Uses current module permissions; no new grants are introduced. Clinical/plan/follow-up categories need clinical read, and billing/communications use their own read grants. Unauthorized sources are excluded before SQL execution; explicit forbidden category requests return 403 without counts or previews.

The DTO omits note bodies, refund reasons, message parameters/recipients, consent evidence and arbitrary audit payloads. Plan titles/totals remain behind plan plus clinical read. Patient registration is clinic-wide, with operational events confined to the selected branch. Links open existing records, including selected plan/follow-up deep links.

Filters use activity timestamps in the clinic timezone; billing/performed/due dates appear separately. A repeatable-read query and timestamp/key cursor preserve PostgreSQL microsecond ordering; each page is capped at 50 events. There are no copied timeline writes or synthetic placeholders for unimplemented prescriptions/files/consents/labs. Their future event integration, complete scheduling history, source-query performance acceptance and browser/staff journey verification remain open.

Validation: `pnpm check` passed lint, TypeScript, 36 unit tests and production build. Rollback-only `pnpm db:verify-timeline` passed source/permission isolation, clinic-date filters, microsecond ordering and multi-page coverage. Browser visual/staff acceptance remains unverified.


## Medical history and alerts — 2026-10-09

Added immutable branch patient-history reviews for medical/dental history, medications, allergies, tobacco history, source and review date. Added versioned alert create/edit/resolve/reactivate with immutable prior content and current projection checks. Clinical read remains separate from demographic read; recording additionally requires new patient.clinical.write, which is not granted to actual accounts automatically.

The profile shows current history, older reviews, active/resolved alerts and pagination. Clinical visits load current branch history/alerts alongside the note, explicitly distinct from signed historical content. Existing signed notes remain unchanged when patient history is updated. Timeline adds generic history/alert activity without note or alert text. Blank fields mean not recorded, never an automatically inferred absence of conditions.

`pnpm check` passed lint, TypeScript, 38 unit tests and production build. `pnpm db:verify-patient-clinical` passed history preservation, active/resolved projections, signed-note preservation, retry/version conflicts, scope/permission denial and audit rollback using synthetic fixtures. Browser/clinician acceptance and any policy-approved cross-branch clinical sharing remain open.


## Expanded demographic profile — 2026-10-09

Added a clinic-wide demographic profile separate from branch medical records: unknown DOB, known DOB or reported age with as-of date, gender as reported, address, alternate phone and emergency contact fields. Updates create immutable revisions and protected current projections. Active/inactive status uses demographic write; changing into/out of Archived additionally requires patient.archive. No records are deleted and no real account grants are added. Archive status is an administrative marker in this slice; appointment/clinical/finance services are not silently disabled.

Added a general profile page available to demographic readers, with clinical sections still independently protected. Patient lists include status. Search now matches normalized primary and alternate phone digits across formatting differences. Profile change metadata joins the permission-filtered timeline. DOB/age/date rules, archive/replay access, cross-clinic denial, immutable projections, phone search and audit rollback passed rollback-only integration checks. Duplicate-review workflow and clinic acceptance remain open.

Profile validation: `pnpm check` passed lint, TypeScript, 40 unit tests and production build. `pnpm db:verify-patient-profile` passed rollback-only profile/phone/archive tests.


## Duplicate registration review — 2026-10-09

Added same-clinic candidate lookup by case-insensitive exact name or normalized primary/alternate phone. Registration previews up to 10 possible matches with links to existing profiles. Creating a separate patient despite matches requires an explicit reason and patient.duplicate.override, which is not assigned automatically. Shared family phones are preserved as separate patients; no automatic merge or overwriting occurs.

Registration serializes per clinic, checks original operation replay before duplicate review, and stores immutable override reason/candidate IDs plus audited actor/branch/time in the same transaction as patient creation. The UI preserves the original request during ambiguous retries. Matching does not guess country codes or identity, and arbitrary candidate IDs cannot be supplied by the client. Profile/archive/history operations remain versioned and independently permission-checked.

Rollback-only duplicate tests passed normalized primary/alternate phone and exact-name candidates, clinic isolation, override permission, family records, original-ID replays, immutable evidence, permission revocation and audit rollback. Separate-connection registration/edit races, fuzzy matching and clinic/staff acceptance remain open.

Duplicate validation: `pnpm check` passed lint, TypeScript, 41 unit tests and production build. Duplicate, patient, visit, timeline, medical-history and profile SQL suites passed with all fixtures rolled back. Current allergies/medications and alert review timestamps are visible in clinical context; failed refreshes clear that summary rather than implying fresh information. Browser/staff acceptance remains unverified.


## Schedule setup: dentists, chairs, hours and closed dates — 2026-10-09

Roadmap task S1. `/schedule-setup` configures, per branch: dentist calendars (name, colour, optional link to an active branch staff account), chairs, weekly opening periods (up to four per weekday, clinic-local time) with calendar slot length, and closed dates with a reason. Nothing is deleted: resources are deactivated/reactivated and closed dates are reopened. Every change writes an immutable `schedule_config_revisions` snapshot, which is also the idempotency record, plus an audit event in the same transaction. Branch configuration commands serialize on an advisory lock; edits use expected versions.

Reading requires `appointment.read` or the new `schedule.configure`; changes require `schedule.configure` (added to the owner role template, never auto-granted to accounts). Staff lists are returned only to configurers. Adding a closed date reports existing bookings on that date and never cancels them. `openingCheck` and `openingRules` are prepared for booking validation in S5; until opening hours are saved, a branch is not restricted.

Validation: `pnpm check` passed lint, TypeScript, unit tests (4 new scheduling tests) and production build. Rollback-only `pnpm db:verify-scheduling` passed retries, stale versions, case-insensitive names, staff-link rules, branch/clinic isolation, existing-booking counts, revision immutability, permission revocation and audit rollback. Browser visual check pending staff sign-in.


## Procedure catalog — 2026-10-09

Roadmap task S2. `/procedures` maintains a clinic-wide catalog: name, optional code, category, default duration (5–480 minutes in 5-minute steps) and optional default price in exact PKR paisa. Every create/edit/deactivate writes an immutable `procedure_versions` snapshot (also the idempotency record) and an audit event in one transaction; the screen shows each procedure's price/duration history. Names and codes are unique per clinic, case-insensitively. Inactive procedures are hidden by default and `activeProcedure` refuses them for new work.

Any active branch member can read the catalog (it holds no patient data); changes require the new `procedure.configure` (owner template; not auto-granted). Catalog prices are defaults only: existing estimates and charges keep their own price snapshots. Booking durations (S3) and plan items (T2) will use the catalog next.

Validation: unit tests for exact paisa parsing, durations, categories and unknown fields; rollback-only `pnpm db:verify-procedures` covers retries, unique names/codes, versioned price history, clinic isolation, inactive exclusion, permissions, immutable history and audit rollback.


## Appointment lifecycle engine — 2026-10-09

Roadmap tasks S3–S7, S8 (server side), S10 and P5. Migration 0023 adds dentist, chair, procedure, reason, notes, next action, booking source and override reason to appointments, and an immutable `appointment_events` history (one row per version, also the idempotency record for later commands). Existing bookings were backfilled into the history from their audit events.

- **Statuses:** booked → confirmed → arrived → waiting → in treatment → completed, plus cancelled and no-show. Shortcuts booked→arrived and arrived→in treatment are allowed (clinic decision pending). Cancelling, and correcting a no-show to arrived, require a reason. No-show is accepted only after the start time. Completed and cancelled are final.
- **Conflicts:** checked under the branch calendar lock: same dentist, same chair, same patient, outside opening hours, closed date. Once a branch has dentist calendars every booking must name a dentist; branches without dentists keep the earlier single-calendar rule. Staff with `appointment.override` may proceed with a recorded reason; others get the list of conflicts.
- **Durations:** choosing a catalog procedure defaults the duration; a different duration needs `appointment.duration.override`.
- **Rescheduling** keeps the appointment ID, records previous and new slot/dentist/chair, returns the status to booked (confirmation must be repeated) and makes queued WhatsApp reminders stale through the version check. Only booked/confirmed appointments can move.
- **Walk-ins** arrive immediately and queue for the dentist; slot and hours checks are not applied.
- **Visits:** a visit can start from arrived/waiting/in-treatment appointments and moves the appointment into treatment in the same transaction. Messaging accepts booked or confirmed appointments. Overview counts and the patient timeline cover every status and event.
- **Concurrency evidence:** `pnpm db:verify-races` builds a throwaway database from the reviewed migrations, uses two separate runtime connections, and drops the database afterwards. 40 contested slots were each booked exactly once, concurrent status changes produced one winner, double-submitted bookings stored once, and simultaneous registration of the same person stored one patient.

Validation: lint, TypeScript, unit tests; `db:verify-appointments` (conflicts, overrides, durations, full flow, corrections, rescheduling, details, walk-ins, visit start, isolation, immutable history, audit rollback) plus all earlier database suites pass. The calendar screen is still the earlier simple day list until S9.


## Appointment calendar screen — 2026-10-09

Roadmap S9 (built, acceptance pending) and S8 (complete). `/appointments` now shows a day grid with one column per active dentist (or a single branch column when none are configured), opening periods shaded by the branch hours, closed dates flagged, and overlapping override/walk-in bookings laid side by side; and a week view with per-day lists that open the day. All times are clinic time (`zonedInstant`/`clockOf` helpers with DST tests), not the device timezone. Clicking an empty slot opens a booking panel prefilled with time and dentist: patient search, dentist, optional chair and procedure (which sets the duration; a different duration needs `appointment.duration.override`), reason, source, notes and next action. A conflict lists every problem and offers "Book anyway" with a reason only to staff with `appointment.override`. Walk-ins are recorded from the toolbar. Selecting an appointment shows its facts, the allowed status buttons (reasons asked for cancellation and no-show corrections; no-show only after start time), start/open clinical visit, reschedule, edit details and the full event history. After a visit note is signed, the visit page offers to mark the linked in-treatment appointment completed. The old simple calendar component was removed.

Validation: `pnpm check` (lint, TypeScript, unit tests, production build) and all database suites, including separate-connection races, pass. A signed-in visual check and timed booking (target under 60 seconds) remain open because no browser session was available.


## Global patient search, recent patients and Quick Add — 2026-10-09

Roadmap P1/P2. Every screen's top bar has a patient search (name, phone, patient ID; same permission-checked API as the directory) with Profile, Timeline and Book links. With an empty box it shows the signed-in staff member's 10 most recently opened patients. Opening a profile, timeline or visit records the view in `recent_patients` (migration 0024): personal, clinic-scoped, demographic fields only, re-checked against current access on every read, never deleted by the runtime role, and not a substitute for read auditing (I4).

Quick Add (top bar) lists only the actions the user may perform: new patient (opens the directory with registration focused, so duplicate review still applies), book appointment, walk-in (the calendar opens with the form started), record payment and follow-up. A patient chosen in search or on a profile is carried to the booking form by ID only; the name is loaded from the server, never placed in the URL. Validation: `db:verify-patient-navigation` plus existing suites.


## Contact preferences for all channels — 2026-10-09

Roadmap P4. The patient profile has a Contact preferences section: do-not-contact, allowed channels (phone, SMS, WhatsApp, email), allowed purposes (appointments, follow-ups/recalls, billing, marketing), preferred channel, how the patient told us, a note and a required reason for each change. Records are clinic-wide, versioned with immutable history (migration 0025), idempotent, audited, and editable with the existing `communication.preferences.write`; reading needs demographic access. "Not recorded" is shown as such and is never presented as agreement.

WhatsApp now checks these preferences both when a message is queued and again just before sending; disallowed queued messages are cancelled with `CONTACT_NOT_ALLOWED` without contacting the provider. Templates may declare a `purpose` (default `appointment`); appointment-linked messages always count as appointment messages. The existing WhatsApp consent record (verified number, evidence, STOP opt-out) still applies in addition. Validation: unit tests, `db:verify-contact-preferences` and the existing messaging suite.

P3 (same day): staff with `billing.read` see a read-only branch balance badge (due, in credit, or none, with an Account link) on the patient profile, in the booking form once a patient is chosen, and in the appointment panel. It is informational and never blocks booking or care.
