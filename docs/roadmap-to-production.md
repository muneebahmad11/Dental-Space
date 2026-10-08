# Roadmap to production

Prepared 2026-10-09. This is the task-by-task build order from the current state of the repository to a production-ready system. It is based on [the implementation plan](../Dental_Clinic_Implementation_Plan.md), [the end-to-end flow](../Dental_Clinic_End_to_End_Implementation_Flow.md), [the technical plan](../Dental_Clinic_Nextjs_Technical_Implementation_Plan.md), [the milestone checklist](milestones.md), [the implementation status](implementation-status.md) and the [2026-10-08 audit](implementation-audit-2026-10-08.md), checked against the code.

Tick a task only when its *Done when* line is true. Update [milestones.md](milestones.md) when a stage closes.

## How to read this file

| Symbol | Meaning |
|---|---|
| `- [ ]` / `- [x]` | Task open / done |
| **S / M / L / XL** | Rough size: S ≤ 4h, M 4–12h, L 12–24h, XL 24h+ (one developer with AI help, including tests) |
| 🔒 | Needs a clinic decision (see [Clinic decisions](#clinic-decisions-you-need-to-collect)). Build with a configurable default; do not call it accepted until the clinic confirms |
| 👤 | Needs you (the owner/developer) to act outside the code: accounts, payments, approvals |
| AT01–AT18 | Acceptance tests from section 9 of the implementation plan |

### Stages at a glance

| Stage | Goal | Milestones | Rough effort |
|---|---|---|---|
| 0 | Housekeeping before new work | — | 1 day |
| 1 | **Finish every partially done core module** | M02–M10 | 160–230h |
| 2 | Production platform: Supabase database, hosting, backups, outage mode | M01, M11 | 70–110h |
| 3 | Core acceptance, data import and controlled pilot → **core production ready (V1)** | M12 | 50–80h + clinic time |
| 4 | Operational depth: files, X-rays, chart, prescriptions, consent, lab, inventory | M13–M16 | 180–300h |
| 5 | Automation: live WhatsApp, reminders, recalls, patient portal, online booking | M17, M18 | 120–210h |
| 6 | Multi-branch and advanced (analytics, forecasting, AI) | M19, M20 | 180–360h |
| 7 | Final acceptance and handover → **full production ready** | M21 | 20–40h |

These ranges are planning estimates, not promises. Re-estimate at the end of each stage using actual hours.

**Production readiness happens twice.** The clinic can go live on the core (V1) at the end of Stage 3. Stages 4–7 add modules to a live system and each module has its own release gate.

## Definition of done (every task)

Follow the existing project conventions (see `src/server/follow-ups`, `src/server/patient-profile` for the latest examples):

1. **Migration**: reviewed Drizzle migration; scoped composite foreign keys; check constraints; `GRANT` to `clinic_runtime` limited to what the service needs; immutable tables protected by the `reject_audit_mutation` triggers; new permission keys inserted into `clinic_app.permissions`. Never edit an applied migration.
2. **Service**: `resolveContext` + `authorize` on every call; clinic/branch scoping in every query; Zod validation; `operationId` + payload hash for idempotent writes; `expectedVersion` for edits; advisory lock where races matter; business write + audit event in one transaction.
3. **API route**: `requireSameOrigin` on mutations, scope headers, `failure()` error mapping, private/no-store responses.
4. **UI**: loading, empty, error, forbidden and conflict states; buttons disabled while saving; the retry key is kept until the save succeeds; controls hidden by permission (server still decides).
5. **Tests**: rule tests added to `pnpm check`; rollback-only `pnpm db:verify-*` suite covering success, denial, scope isolation, replay, conflict and audit rollback; CI updated.
6. **Docs**: status entry in [implementation-status.md](implementation-status.md), runbook if staff behaviour changes, this file ticked.
7. **No silent grants**: new permissions are never assigned to real accounts by migrations.

---

## Stage 0: Housekeeping (do first)

- [x] **0.1 Commit the duplicate-review work** (S). The migration `0020`, duplicate-candidates API, tests and doc edits are still uncommitted. *Done when:* `pnpm check` and `pnpm db:verify-patient-duplicates` pass, the work is committed, pushed, and CI is green.
- [x] **0.2 Grant your own local account the permissions you need to test** (S) 👤. Many screens show "access required" because new permissions are not granted automatically. Use `scripts/grant-local-access.ts` with an explicit list. *Done when:* every current screen opens for your local owner/dentist test account.
- [x] **0.3 Create the clinic decision register** (S). Add `docs/architecture/clinic-decisions.md` with the 15 decisions below, the development default used for each, owner and due date. *Done when:* every 🔒 item in this file points to a register row.
- [ ] **0.4 Signed-in browser walkthrough of what exists** (S). Book → arrive → visit → plan → charge → pay → receipt → follow-up → close the day in the browser. Record defects as tasks here. *Done when:* a list of found defects exists (fix critical ones before Stage 1).

---

## Stage 1: Finish the partially done core

Order inside the stage matters: scheduling and the procedure catalog come first because clinical, plans, finance and the dashboard all reuse them.

### 1A Scheduling (M04): the biggest gap

Today: one calendar per branch, statuses `booked / arrived / cancelled`, branch-wide overlap lock, day list only.

- [x] **S1 Clinic resources and hours** (L). Tables for clinicians (link to membership, display name, colour, active), chairs (optional per PRD), weekly opening hours per branch, closed dates/holidays. Settings screen for admins with a new `schedule.configure` permission. *Done when:* an admin can set up 2 dentists, 2 chairs and opening hours, and the configuration is audited.
- [x] **S2 Procedure catalog** (M) 🔒. Clinic-level procedures: name, code, category, default duration, default price (PKR paisa), active flag, versioned price history. Used later by plans, visits and charges. *Done when:* catalog CRUD with history works and price changes never alter existing estimates.
- [x] **S3 Appointment details** (M). Add dentist, optional chair, procedure/reason, notes, next action, booking source (`phone`, `walk_in`, `in_person`, later `online`). Duration defaults from procedure; changing it needs `appointment.duration.override`. *Done when:* booking stores and shows all fields; old rows remain valid.
- [x] **S4 Full status model and history** (L). Statuses: `booked → confirmed → arrived → waiting → in_treatment → completed`, plus `cancelled`, `no_show`, `rescheduled`. Allowed transitions defined once in `src/lib/appointments/` (with clinic-approved shortcuts 🔒). New immutable `appointment_events` table (from/to status, actor, reason, time). Update the modules that depend on status: visits (start from arrived/waiting/in_treatment), messaging and worker (`booked` or `confirmed`), overview counts and timeline labels. *Done when:* AT04 passes; every transition is in history; invalid transitions return 409.
- [x] **S5 Resource conflicts and overrides** (M). Conflict check per dentist and per chair (not branch-wide), opening-hours validation, recheck inside the transaction under the lock. Overlap allowed only with `appointment.override` and a written reason, audited. *Done when:* AT03 passes, including the override path.
- [x] **S6 Rescheduling** (M). Keep the same appointment ID, record old and new slot in `appointment_events`, bump version; pending WhatsApp reminders for the old slot become stale (already enforced by version check, extend tests). *Done when:* reschedule history shows both slots; a queued reminder for the old time is not sent.
- [x] **S7 Walk-in flow** (S). One action: create a walk-in appointment that starts now as `arrived`, then start the visit. *Done when:* walk-in appears in today's flow counts and links to its visit.
- [x] **S8 Visit ↔ appointment completion** (S). Starting a visit moves the appointment to `in_treatment`; signing the visit offers to mark it `completed`. *Done when:* both links are transactional and audited.
- [ ] **S9 Calendar UI** (XL). *Built 2026-10-09; open until checked in a signed-in browser and timed with reception.* Day view with columns per dentist (or chair), week view, filters (dentist/status), click empty slot to book, booking drawer with patient search + duplicate check + outstanding balance badge (shown, never blocking), status buttons, history panel, clinic timezone shown explicitly. Works on tablet width. *Done when:* receptionist can book a returning patient in under 60 seconds (AT18 target) on desktop and tablet.
- [x] **S10 Real concurrency test** (M). Script that opens two separate database connections and books the same dentist slot simultaneously; repeat for status changes. *Done when:* exactly one booking succeeds in 100 runs.

### 1B Patients (M03)

Today: demographics, profile revisions, archive, history/alerts, duplicate review all done.

- [x] **P1 Global search and recent patients** (M). Search box in the app header (ID/name/phone) and a per-user recent-patients list, both permission-filtered on the server. *Done when:* a user without clinical access sees no clinical data through search or recents.
- [x] **P2 Quick Add** (M). Header menu: new patient, appointment, walk-in, payment, follow-up, each opening a short form. *Done when:* each Quick Add action reuses the existing service and duplicate checks.
- [ ] **P3 Balance on profile and booking** (S, after F3/F4). Show current receivable/credit on profile and in booking drawer, read-only, requires `billing.read`.
- [ ] **P4 Communication preferences for all channels** (M). Per channel (call, SMS, WhatsApp, email) and purpose (appointment, recall, billing, marketing) with consent source and opt-out, versioned. WhatsApp consent becomes one case of this. *Done when:* messaging checks use the new preferences and existing consent data is migrated.
- [x] **P5 Race test for registration/edit** (S). Separate-connection test like S10.
- [ ] **P6 Fuzzy duplicate matching** (M) 🔒 optional. `pg_trgm` name similarity plus DOB; only if the clinic wants it.
- [ ] **P7 Required-field acceptance** 🔒. Clinic confirms which fields are mandatory; adjust validation.

### 1C Clinical visits (M05)

Today: draft/sign/amend with immutable revisions; free-text fields; alerts visible.

- [ ] **C1 Tooth reference model** (M) 🔒 numbering. Shared type + validator: numbering system (FDI default), dentition (permanent/primary), tooth, optional surfaces. Stored with every tooth reference so the future chart never reinterprets old data. *Done when:* invalid teeth (e.g. 19 FDI, 55 for permanent) are rejected in visits and plans.
- [ ] **C2 Structured visit content** (L). Diagnoses/findings list, performed procedures (from catalog, with tooth references), materials/technique, instructions, outcome, next step, still inside versioned visit revisions. *Done when:* AT05 passes with structured data and amendment keeps old values traceable.
- [ ] **C3 Starter templates** (L) 🔒 content. Versioned templates table, 2–3 dentist-approved starter templates (e.g. RCT, extraction, scaling). Applying a template copies its content into the draft. *Done when:* editing a template never changes an existing note.
- [ ] **C4 Plan follow-on from visit** (M). From a visit: create follow-up, book next appointment, or record completion of an accepted plan item (reuse existing completion records). *Done when:* links appear on the visit and in the timeline.
- [ ] **C5 Visit ↔ plan completion linkage** (M). Completion records reference the visit that performed them.

### 1D Treatment plans and estimates (M06)

Today: versioned estimates, acceptance, partial completion, locked-price billing.

- [ ] **T1 Item lifecycle** (L). Item statuses `proposed, explained, accepted, rejected, deferred, in_progress, completed` with history; plan summary derived from items, never set by hand. *Done when:* AT06 passes (partial completion keeps remaining work; deferred/rejected items stay visible and never block care).
- [ ] **T2 Item priority, notes and catalog link** (S).
- [ ] **T3 Discount and validity** (M). Per-item or plan discount with reason and `plan.discount` permission; estimate validity date. Accepted prices including discounts are frozen.
- [ ] **T4 Printable estimate** (M). Print page like receipts, clinic header, version number; printing/sharing audited. (PDF in Stage 4.)
- [ ] **T5 Corrections and revisions** (L). Reverse a completion with a reason (blocked if already billed unless the charge is credited); supersede an accepted plan with a new version while keeping the old acceptance.

### 1E Billing and payments (M07)

Today: charges, partial payments, allocations, receipts, refunds, all exact and immutable.

- [ ] **F1 Configurable payment methods** (M). Per-clinic list seeded with Cash, Card, Bank transfer, Easypaisa, JazzCash; method flagged as cash or non-cash for closing. Existing rows map to the new table.
- [ ] **F2 Charge discounts** (M) 🔒 rules. Discount line with reason and `discount.apply` permission and optional limit.
- [ ] **F3 Credit notes** (L). Reduce a posted charge without moving money; distinct from refunds. Balance = charges − discounts − credit notes − net payment allocations. *Done when:* both worked examples from section 5 of the plan (due 6,000 and due 5,000) pass as tests.
- [ ] **F4 Patient credit (overpayment)** (L). Unallocated amount stored as patient credit, applied to later charges, refundable; kept separate from revenue.
- [ ] **F5 Charge correction** (M). Wrong charge → credit note + replacement charge, linked; never edit.
- [ ] **F6 Deposits** (M) 🔒 optional. Only if the clinic chooses it.
- [ ] **F7 Receipt sharing** (M). Manual share (copy link/WhatsApp click-to-chat) only if patient preference allows; share is audited.
- [ ] **F8 Money race tests** (M). Separate connections: double-click payment, two concurrent refunds of the same payment, payment during closing approval. *Done when:* AT07 and AT08 pass.

### 1F Expenses and daily closing (M08)

Today: paid expenses, closing draft, separate approval, locked day.

- [ ] **E1 Payee/supplier and full categories** (M). Supplier table (shared later with lab and inventory), configurable categories including materials, lab, rent, utilities, salaries, maintenance, marketing, miscellaneous.
- [ ] **E2 Unpaid bills vs payments** (L). An expense can be recorded as owed and paid later (possibly partly); cash reports count only payments.
- [ ] **E3 Expense approval** (M) 🔒. Optional submit → approve flow by amount threshold.
- [ ] **E4 Other cash movements** (M). Documented cash in/out (bank deposit, owner drawing, float top-up) included in expected cash.
- [ ] **E5 Post-close adjustments** (M) 🔒 policy. Corrections after approval create adjustment records against the closed day; the approved snapshot never changes. *Done when:* AT09 passes.
- [ ] **E6 Expense attachments**. Moved to Stage 4 (needs the file service, O1).

### 1G Follow-ups, communication log and timeline (M09)

- [ ] **U1 Manual communication log** (M). Any channel (phone, SMS, WhatsApp manual, in person, email), purpose, outcome, note, linked to patient and optionally appointment/follow-up/plan. Follow-up contact entries reuse it.
- [ ] **U2 Message templates for manual use** (M) 🔒 wording. Clinic-managed texts for confirmation, reminder, missed appointment, follow-up, estimate, receipt, recall, filled with patient data and copied/opened in WhatsApp click-to-chat. Usage is logged.
- [ ] **U3 Follow-up defaults from visits/procedures** (S). Suggested follow-up type and due date from procedure (e.g. suture removal 7 days), still created by staff.
- [ ] **U4 Timeline coverage** (S). Add appointment events, communication log, discounts/credit notes/credits. *Done when:* AT10 passes.

### 1H Dashboard, reports and navigation (M10)

- [ ] **R1 Role dashboard** (L). Today's schedule; waiting/in treatment/completed counts; no-shows, cancellations, reschedules; collections/refunds/expenses (finance roles only); due/overdue follow-ups; medical alerts for today's patients (clinical roles only); quick actions. Modules that do not exist yet show nothing, never fake zeroes.
- [ ] **R2 Core report catalog** (XL) 🔒 definitions. Appointments by period/status/dentist; new vs returning patients (defined by first completed visit); procedures by dentist; plan acceptance outcomes; collections by method; receivables aging 0–30/31–60/61–90/90+; discounts/credit notes/refunds; expenses and cash-basis net; follow-up/recall performance. Each report reconciles to source rows in a test.
- [ ] **R3 Export** (M). CSV export with `report.export` permission, audited, branch-scoped.
- [ ] **R4 Clinic timezone everywhere** (S). All dates rendered in the clinic timezone (not the device), labelled. *Done when:* AT15 passes with day-boundary cases.

### 1I Identity, staff administration and security (M02)

- [ ] **I1 Staff administration** (L). Owner can invite staff (Supabase admin invite from the server, service key server-only), create memberships, assign branches, roles and individual grants, deactivate staff. All audited. Replaces local grant scripts.
- [ ] **I2 Password reset, session refresh, idle timeout** (M) 🔒 timeout length.
- [ ] **I3 Final role matrix** (M) 🔒. Update the five role templates with every permission added since; document in `docs/architecture/permissions.md`.
- [ ] **I4 Sensitive read auditing** (M). Audit viewing of clinical records, exports and receipts.
- [ ] **I5 Rate limiting** (S). Login and mutation endpoints.
- [ ] **I6 Audit change details** (M). Store before/after fields for sensitive edits without logging clinical text into ordinary logs.
- [ ] **I7 Module boundary lint rules** (S). ESLint import rules from the technical plan (UI cannot import server/db). *Done when:* AT11 and AT12 pass for every role.

**Stage 1 exit gate:** AT01–AT12 and AT15 pass on the local build; no known defect involving wrong money, wrong access, lost records or wrong clinician attribution.

---

## Stage 2: Production platform

The business database is currently **local PostgreSQL on your Mac (127.0.0.1:54329)**. Supabase is used only for staff login. This stage moves everything to hosted infrastructure.

- [ ] **D1 Hosting and data location decision** (S) 👤🔒. Supabase region, app host (e.g. Vercel), worker host, monthly budget, jurisdiction/privacy rules.
- [ ] **D2 Supabase projects per environment** (M) 👤. Separate staging and production projects (dev stays local). Production on a paid plan with point-in-time recovery.
- [ ] **D3 Move the business database to Supabase Postgres** (L). Run migrations with the migration credential; create the restricted `clinic_runtime` role; keep `clinic_app` out of the Data API exposed schemas; connect through the pooler (check `postgres.js` `prepare: false` for transaction mode); update `local-db`/`migrate` safeguards so remote targets need an explicit flag. *Done when:* every `pnpm db:verify-*` suite passes against staging.
- [ ] **D4 Staging deployment** (M). App deployed with secrets in the host's environment settings, exact `NEXT_PUBLIC_APP_URL`, HTTPS. *Done when:* a minimal signed-in smoke test passes on staging.
- [ ] **D5 Worker deployment** (M). The WhatsApp/background worker runs as a persistent process or scheduled job on staging, with lease timeouts and restart policy.
- [ ] **D6 Health, logging and monitoring** (M). `/api/health` (DB + auth reachability), structured logs with patient data removed, error tracking with personal data scrubbed, uptime alert to a named person.
- [ ] **D7 Backups and restore** (L) 🔒 RPO/RTO. Proposed targets: lose at most 1 hour, restore within 4 hours. PITR + storage backups, backup-failure alert, restore into a separate project, verification script (row counts, balances, receipts, permissions, sample visit), measured time, runbook. *Done when:* AT13 passes with a recorded restore time.
- [ ] **D8 Outage mode** (XL) 🔒 downtime scope. Service worker caching the app shell and today's minimal schedule with "offline since" banner; visit draft autosave in IndexedDB with saving/local-only/synced/failed indicator; reconnect with stable draft ID and version, conflict screen, no silent overwrite; offline payments/bookings/registration blocked; storage-quota errors shown; logout clears caches. *Done when:* AT14 passes on the clinic's actual browsers.
- [ ] **D9 Security hardening** (M). Security headers (CSP, HSTS, frame-ancestors), dependency audit in CI, Supabase Auth settings (strong passwords, optional MFA for owner), secret rotation procedure, `/security-review` pass.
- [ ] **D10 Production environment and release procedure** (M). Production deploy, pre-migration backup step, backward-compatible migrations, rollback runbook that never deletes new transactions.
- [ ] **D11 Formatter decision** (S). Adding Prettier would reformat the whole codebase. Either do it in one isolated commit with CI enforcement, or record the decision to skip.

**Stage 2 exit gate:** staging mirrors production; restore measured; outage test passed; monitoring alerts reach a person.

---

## Stage 3: Core acceptance, import and pilot → core production ready

- [ ] **Q1 End-to-end browser tests** (L). Playwright in CI against a seeded database: full staff journey (AT17), role denial for each role, receipt print page, closing.
- [ ] **Q2 Synthetic dataset and performance** (M). Seed 100 patients/200 appointments for demos; separately 10,000 patients/50,000 appointments for performance. *Done when:* AT18 targets measured on clinic hardware/network (schedule p95 < 2s).
- [ ] **Q3 Devices and printer** (M) 👤. Receipt, estimate and closing print on the clinic printer; tablet layout check for dentist screens.
- [ ] **Q4 Data import** (L) 🔒 scope. CSV staging tables, validation report, duplicate candidates, dry run with counts and totals, commit with batch/source IDs, opening balances imported exactly once. *Done when:* AT16 passes.
- [ ] **Q5 Privacy and retention register** 👤🔒. Owner-approved policy for patient data, consent, retention, exports and who can see what. Production stays inactive until this exists.
- [ ] **Q6 Staff guides** (M). Reception, dentist, assistant, cashier/accountant, owner, downtime procedure, closing and correction procedure.
- [ ] **Q7 Training and sign-off** 👤. Staff practise on staging with synthetic data; dentist and owner sign off the core workflows.
- [ ] **Q8 Go-live** 👤. Production import and reconciliation, smoke test, small controlled pilot, reconcile the first daily close, review errors/failed jobs/pending drafts daily for the first week, then expand.

**🎯 Core production-ready gate (V1):** AT01–AT18 pass on staging and production; backup/restore proven; policies confirmed; staff trained; owner and dentist sign-off. The clinic can now use the system for daily work.

---

## Stage 4: Operational depth (V1.5)

Build one module at a time on the live system; each one has its own gate.

- [ ] **O1 File service** (L). Private Supabase Storage bucket, server-issued signed upload URLs, type/size/content checks, pending → available state, short-lived signed downloads, orphan cleanup job, audited access.
- [ ] **O2 Images and X-rays** (L) 🔒 CBCT meaning. Photo categories (pre/during/post), radiographs (IOPA, OPG, bitewing, CBCT as stored file, configurable), PDFs; tags for tooth/visit/treatment; gallery, before/after comparison; download/print by permission and consent.
- [ ] **O3 Attachments elsewhere** (S). Expense receipts (E6), lab slips, consent scans via O1.
- [ ] **O4 Interactive dental chart** (XL) 🔒 design. Adult and pediatric charts on top of the C1 tooth model; findings (caries, restoration, missing, RCT, crown, implant, extraction planned/done, fracture, custom); per-tooth history linking notes, treatments and files.
- [ ] **O5 Template editor and library** (M). Full dentist-managed library extending C3.
- [ ] **O6 Prescriptions** (L). Medication, strength, dose, frequency, duration, instructions; dentist enters every value (never suggested automatically); approval by the responsible dentist before print; versions; printable/PDF; timeline event.
- [ ] **O7 Consent forms** (L) 🔒 legal. Versioned forms per procedure, signature capture (on-screen signature or scanned signed form), exact signed content stored immutably, linked to visit/treatment.
- [ ] **O8 Estimate and receipt PDFs** (M). Server-generated PDFs, sharing audited.
- [ ] **O9 Lab cases** (L). Labs (suppliers), case with tooth/type/material/shade/instructions/files, statuses To Send → Sent → In Progress → Received → Delivered (+ remake), dates, overdue alerts, cost posted to expenses exactly once.
- [ ] **O10 Inventory** (XL) 🔒 consumption. Items, units, minimum levels, suppliers, purchases, lots/expiry, movement ledger (quantity derived, never stored), adjustments with reason, low-stock/expiry alerts, reports; optional procedure consumption.
- [ ] **O11 Full report catalog and widgets** (L). Lab and inventory reports, optional chair utilization, dashboard alerts for labs/stock.
- [ ] **O12 Timeline integration** (M). Files, prescriptions, consents, labs in the patient timeline with permission filtering.

**Gate:** dentist validates each clinical module; historical documents unchanged; stock, lab costs and expenses reconcile.

---

## Stage 5: Automation and patient access (V2)

The WhatsApp plumbing (queue, consent checks, webhooks, retries, delivery history) is already built and tested with a fake provider. What remains:

- [ ] **W1 Meta WhatsApp Business setup** 👤. Business verification, dedicated phone number, permanent access token, app secret, templates submitted and approved by Meta. Follow [docs/runbooks/whatsapp.md](runbooks/whatsapp.md). Secrets go into hosting settings, never into chat or git.
- [ ] **W2 Live test on staging** (M). Webhook URL on staging HTTPS, verify token check, send an approved template to your own number, confirm delivered/read receipts and an opt-out reply. *Needs D4 first, because Meta requires a public HTTPS callback.*
- [ ] **W3 Automatic appointment reminders** (L) 🔒 timing. Configurable lead times (e.g. 24h and 2h), quiet hours, skipped when cancelled/rescheduled (version check), pause switch per clinic and per patient.
- [ ] **W4 Automatic recalls** (L) 🔒 rules. Rules create recalls from completed procedures; contact jobs with approval option; manual pause.
- [ ] **W5 Other automated messages** (M). Missed appointment, follow-up, receipt, estimate, using approved templates and preferences.
- [ ] **W6 SMS adapter** (M) 🔒 optional. Same queue, different provider.
- [ ] **W7 Patient portal identity** (XL) 🔒 scope. Separate patient login (phone OTP), verified link to the patient record (never by name), guardian access if required, strict patient isolation.
- [ ] **W8 Online booking** (L). Only approved free slots shown, server revalidation, rate limits, duplicate protection, optional staff approval.
- [ ] **W9 Digital forms** (L). Medical history and consent intake submitted for staff review; never overwrites signed clinical records automatically.

**Gate:** duplicate and unauthorized sends impossible in tests; failed delivery visible to staff; patient isolation tests pass.

---

## Stage 6: Multi-branch and advanced (V3)

- [ ] **B1 Multi-branch operations** (L) 🔒 sharing policy. Branch management screen, staff per branch, shared patient access rules separate from local visit/finance access, per-branch and combined reports, branch-scoped exports and caches.
- [ ] **B2 Advanced analytics** (L) 🔒 metrics. Metric definitions first, then dashboards that reconcile to source records.
- [ ] **B3 Inventory forecasting** (L) 🔒. Forecast horizon, lead times, baseline from history, error evaluation, insufficient-data states; staff review before purchasing.
- [ ] **B4 AI-assisted documentation** (XL) 🔒. Permitted inputs and provider/data policy agreed first; draft notes with visible source context; dentist review required before anything is final; never selects diagnosis, medication or dose; tests for fabricated facts, wrong patient and malicious instructions in uploaded content.

---

## Stage 7: Final acceptance and handover → full production ready

- [ ] **H1 Acceptance register** (M). Every PRD requirement marked passed with evidence or explicitly unresolved.
- [ ] **H2 Repeat recovery drill** (S) on the final production configuration.
- [ ] **H3 Handover documents** (M). Setup, environment-variable reference (names only), schema/migrations, permission matrix, API catalog, runbooks, incident procedure.
- [ ] **H4 Named owners** 👤 for hosting, backups, WhatsApp provider, scheduled jobs and support.
- [ ] **H5 Final sign-off** 👤 by owner and dentist.

**🎯 Full production-ready gate:** every selected requirement passes its acceptance criteria.

---

## Clinic decisions you need to collect

Development can continue with defaults, but the related tasks are not accepted until these are confirmed.

| # | Decision | Blocks | Development default |
|---|---|---|---|
| 1 | Dentists, chairs, branches, staff schedules, opening hours | S1, S5, B1 | Configurable; nothing assumed |
| 2 | Mandatory patient fields | P7 | Name + phone required |
| 3 | Tooth numbering and chart style | C1, O4 | FDI, permanent + primary |
| 4 | Common procedures, durations, prices, templates | S2, C3 | Empty catalog; sample templates marked draft |
| 5 | Discounts, refunds, deposits, partial payments | F2, F6, T3 | Discount needs permission + reason; no deposits |
| 6 | Who creates/edits/approves money | I3, E3, E5 | Separate approver for closing (already enforced) |
| 7 | Medical history and consent fields | O7, W9 | Current history fields |
| 8 | Routine follow-ups and recalls | U3, W4 | Manual only |
| 9 | Messaging provider and consent process | W1–W6 | WhatsApp Cloud API, disabled |
| 10 | How much old paper data to import | Q4 | Active patients + verified opening balances |
| 11 | Devices, browsers, printer, internet quality | S9, Q3, D8 | Desktop Chrome + tablet |
| 12 | What must work during an internet outage | D8 | Read today's schedule + keep visit drafts |
| 13 | Retention, exports, privacy rules | Q5, R3 | No exports until approved |
| 14 | Multi-branch now or later | B1 | One branch, schema ready for more |
| 15 | Report definitions | R2, B2 | New patient = first completed visit; aging 0–30/31–60/61–90/90+ |

## What you need to provide outside the code 👤

- Clinic decisions above (owner, dentist, receptionist).
- Supabase staging and production projects and a paid plan for production backups.
- An app hosting account and a domain name.
- Meta WhatsApp Business account, phone number and approved templates.
- The clinic printer and tablet for testing.
- Staff time for training and acceptance.

## Recommended next 10 tasks

1. 0.1 Commit duplicate review
2. 0.2 Local permission grants
3. 0.3 Decision register
4. 0.4 Browser walkthrough
5. S1 Clinic resources and hours
6. S2 Procedure catalog
7. S3 + S4 Appointment details and full status history
8. S5 + S6 Resource conflicts, overrides, rescheduling
9. S9 Calendar UI (day/week)
10. S10 Real concurrency test
