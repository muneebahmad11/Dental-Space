# Dental Clinic Software Implementation Plan

Prepared 26 September 2026. Source: Dental_Clinic_Software_PRD_Expanded.docx, dated 25 September 2026, sections 1–34.

## 1 Delivery recommendation

Your confirmed target is all V1, V1.5, V2 and V3 features in seven days, built by one developer with AI assistance from a fresh codebase. This is not a credible production delivery commitment. The achievable one-week target is a demonstrable core workflow with synthetic data, followed by a staged implementation of the remaining requirements. Its own roadmap separates essential operations, operational depth, automation, and advanced capabilities. A screen that saves sample data is not a completed module: permissions, corrections, audit history, reconciliation, recovery, and staff acceptance must also work.

This plan accounts for every PRD section and assigns delivery scope and acceptance evidence. It does not silently remove deferred requirements. Day 7 is a demonstration and readiness assessment, not a promise of a live pilot. The full product is complete only when every release requirement passes acceptance. The phased alternative below does not meet the requested all-features-in-one-week deadline; it explains what would be required instead.

Confirmed constraints: solo developer, AI assistance, fresh start, all roadmap features desired within one week. Remaining planning assumptions:

- Seven working days with approximately six focused implementation hours daily, for 42 hours total. Developer testing is included in that capacity. Dentist, receptionist and owner review time must be arranged separately.
- Starting fresh, using a stack you already know, existing UI components, established authentication, and managed infrastructure.
- One clinic, configurable dentists and chairs, one currency and clinic timezone, no public patient accounts in week one.
- No payment gateway in week one. Staff record cash, card, bank transfer, Easypaisa/JazzCash and other configured methods; recording a method does not process money through that provider.
- No WhatsApp/SMS API dependency in week one. Staff record communications and use approved manual channels.
- Only active patients and verified opening balances are imported for the pilot. Full historical paper digitization is a separate workstream.
- All dates below are relative to the agreed start. Do not assume the user has committed staff or a start date.

Use AI to draft bounded changes, generate fixtures, review migrations and propose tests. You remain responsible for reviewing code, executing tests, checking permissions and verifying financial behavior. Do not run overlapping AI edits to the same files without integration control. AI output is not acceptance evidence, and no unverified speed multiplier is assumed.

## 2 What the PRD leaves unresolved

| Issue | Why it changes the build | Proposed decision |
|---|---|---|
| Full scope versus seven days | The source explicitly spans V1 through V3 | Proposed alternative: demonstrate the core by Day 7 and retain a tracked backlog for everything else; this requires a change to the requested deadline or completion standard |
| Daily closing is absent from the V1 list | Section 30 depends on it; otherwise collections cannot be reconciled properly | Pull a basic closing and cash-expense workflow into the pilot |
| Timeline, templates and communication history are V1.5 | Core clinical and reception workflows benefit from these immediately | Include a basic event timeline, a few approved templates, and manual communication logs in the pilot; expand later |
| Estimates are V1.5 but planning is V1 | A plan needs priced items, but a formal quotation can be separate | Include item prices and totals now; versioned printable quotations in V1.5 |
| Visual chart is explicitly a roadmap item | Adult/pediatric mapping needs dentist validation | Store structured tooth numbers now; build the chart only after numbering approval |
| Walk-in mixes arrival type with appointment status | A walk-in can also be waiting, in treatment or completed | Store walk-in as booking type and display a Walk-in label alongside lifecycle status |
| Rescheduled could lose the previous slot | Overwriting removes operational history | Preserve old/new slot events and link replacement bookings or revisions |
| Offline scope is undefined | Safe multi-device writes are a substantial subsystem | Pilot: limited cached schedule plus recoverable in-progress visit drafts; no offline payments or new bookings |
| Finance definitions are missing | Refunds, credits and balances can otherwise disagree | Approve a written transaction model and sample calculations before implementation |
| Data jurisdiction is unspecified | Hosting, consent, retention and export policies depend on it | Clinic owner confirms jurisdiction and policy before real patient data is entered |

These are proposed implementation decisions, not statements that the clinic has approved them. If offline payments, full charting, signed electronic consent, or every V1.5 module is required on Day 7, re-estimate the deadline rather than describing a reduced implementation as compliant.

## 3 Requirements coverage and acceptance map

Legend: **P** = core pilot release, with only a subset demonstrated during the solo seven-day sprint; **O** = operational depth after pilot; **A** = automation; **F** = advanced/future. A split means that the later portion remains an open requirement. Section numbers refer to the source PRD.

| PRD | Requirement coverage | Release and completion evidence |
|---|---|---|
| 1–2 | Central operating workflow; speed, privacy, accountability, recovery | P: staff complete the journey from booking through closing; operational goals tested rather than assumed |
| 3 | Owner/admin, dentist, receptionist, assistant, accountant with distinct permissions | P: five roles seeded; positive and negative access tests; no role silently erases history |
| 4 | Schedule with patient/time/reason/dentist/chair/status/next action; flow counts; cancellations, reschedules, no-shows; collections/balances/refunds/expenses; due follow-ups/recalls; alerts and quick actions; role filtering | P: core dashboard reconciles with source records; O: live lab and low-stock widgets when modules ship; unavailable widgets are clearly absent rather than fake zeroes |
| 5 | Day/week calendar, hours, dentist/chair/duration, all statuses, default procedure durations and controlled changes, overlap override with reason, calls/walk-ins, confirmation/history, cancellation/reschedule history, notes/next action, duplicate warnings | P: each workflow tested, including simultaneous bookings; chair scheduling configurable, optional per PRD |
| 6 | Generated ID; name/phone/alternate contact/DOB or age/gender/address/emergency contact; alerts/allergies/medications/medical and dental history/tobacco; communication consent; active/inactive/archived; search and duplicates | P: field checklist and validation pass; required fields approved; age without DOB retained without inventing a birth date; family members may share a phone |
| 7 | Unified appointments, visits/notes, diagnoses, treatments/plans, payments/receipts, prescriptions, images, consents, labs, follow-ups/recalls, communications | P: implemented modules populate a permission-filtered timeline; O: all remaining event types integrated, with no restricted text leaked through summaries |
| 8 | Complaint, visible alerts/history, diagnosis/findings, tooth numbers, performed/planned procedures, materials/technique, notes/instructions, outcome/status, next step/appointment, clinician/time/edit history | P: dentist validates a routine visit and a corrected visit; draft/final states and amendments preserve authorship |
| 9 | Adult/pediatric interactive chart, tooth history, configurable findings including caries/restoration/missing/RCT/crown/implant/extraction/fracture, files/notes, numbering configuration | P: structured tooth-number recording; O: dentist-approved chart and tooth timeline, including all finding types and both dentitions |
| 10 | Plans separate from visit notes; Proposed/Explained/Accepted/Rejected/Deferred/In Progress/Completed; tooth/procedure/price/priority/notes; totals/discount/validity; completed versus remaining; no automatic care blocking; printable estimate | P: item-level plan and status tracking; O: versioned printable/shareable quote with discount/validity; accepted estimate prices cannot change silently |
| 11 | Dentist-editable templates for RCT, extraction, crown/bridge, scaling/perio, implant, orthodontics, other procedures | P: 2–3 clinic-selected templates; O: complete template editor and approved library; changes do not alter historical notes |
| 12 | Medication/strength/dose/frequency/duration/instructions; explicit dentist approval; no automatic selection; retained history; printable prescription | O: draft cannot be printed/shared as approved; only authorized dentist signs; approved revision preserved; medication choice remains with clinician |
| 13 | Dated pre/during/post photo gallery; IOPA/OPG/bitewing/CBCT/configurable radiographs; PDFs; tooth/treatment tags; before/after; controlled download/print/share; type/size limits | O: private attachments and comparison view tested; clarify whether CBCT means attachment storage or a diagnostic DICOM viewer—the latter is not specified and needs its own estimate |
| 14 | Configurable extraction/RCT/implant/surgery/crown/bridge/orthodontic/whitening/other consents; signatures where supported; timestamp/version; treatment/visit link; immutable signed history | O: create/sign/view/version flow tested; scanned signed forms can be an agreed implementation; do not claim legal validity solely from a signature image |
| 15 | Charges/discounts/payments/balances/refunds, configured methods, partial payments/history, print/share receipts, authorized refund reason/time, traceable correction, balances on profile/booking; optional deposits | P: core ledger, receipt PDF/print and controlled manual sharing, reversals/refunds tested; O: optional deposit/minimum-payment rules only if clinic elects them |
| 16 | Method totals, expected/actual cash, refunds/adjustments, cashier close/admin approval, variance explanation, locked closing/audit | P: close a seeded day and reconcile exactly; subsequent correction creates an adjustment without overwriting the closed record |
| 17 | Expense category/amount/method/payee/date/notes, all named categories, receipt attachments, approval, daily/monthly reports | P: approved cash-expense entry needed for closing; O: full methods, attachments, configurable approval and reporting |
| 18 | Patient/tooth/treatment lab case, lab/type/material/shade/instructions/files, six statuses, sent/expected/received dates, cost/payment, overdue alerts and timeline | O: complete case from To Send to Delivered; overdue detection and cost reconciliation; prevent duplicate expense posting |
| 19 | Item/category/unit/quantity/minimum/supplier; cost/lot/expiry; stock-in/out/adjustments; low-stock/expiry; reports/purchase history; optional consumption | O: movement ledger reconciles to quantity and alerts; optional procedure consumption requires clinic decision and separate tests |
| 20 | Today/upcoming/overdue, all named and custom follow-up types, responsible staff, Due/Contacted/Booked/Completed/Closed/Unable to Reach, notes and future preventive recalls | P: manual follow-up and recall scheduler with all statuses; A: automated creation/contact rules after approval |
| 21 | Date/channel/purpose/sender/outcome history, seven communication template types, preferences/opt-out; later WhatsApp/SMS; no uncontrolled automation | P: manual log and preferences; O: full approved template library; A: provider integration, consent enforcement, delivery status, opt-out and retry controls |
| 22 | Appointment periods, patient new/returning, no-shows/cancellations/reschedules, procedures/dentist, plan outcomes, collections/method, aging, discounts/refunds, expenses/net, recall performance, lab/inventory, optional utilization | P: appointment/patient/collection/balance/discount/refund and basic follow-up reports; O: full catalog and lab/inventory/utilization; financial summary explicitly defines cash basis versus other accounting |
| 23 | Global patient search, today/overdue balances/follow-ups/labs/pending treatment filters, recent patients, Quick Add, minimal navigation | P: core search/filter/navigation; O: lab filter with lab module; search and recent lists enforce permissions |
| 24 | Secure login, least privilege, separate clinical/finance permissions, audit of all named sensitive changes, actor/time/diff, no silent deletion, encrypted transport/storage, session timeout/security policy, authorized export | P: shared controls and core audit; O/A/F: every added module inherits them; direct API calls and exports tested, not just hidden buttons |
| 25 | Automatic encrypted backups, documented/tested restore, backup-failure alerts, downtime mode, cached essentials, safe sync of any offline records | P: monitored backups and demonstrated restore; limited outage scope tested; broader offline creation remains a separately estimated extension if selected |
| 26 | Future branches with independent schedules/chairs/permissions/finance and controlled shared patients | P: clinic/branch-aware schema and scoping tests; F: actual multi-branch workflows and controlled record sharing |
| 27 | Fast booking/documentation/schedule, desktop/tablet/common devices, readable alerts, selective required fields, Quick Add | P: timed staff scenarios and target-device testing; targets below are proposed measurable criteria |
| 28 | Confirm actual patient-data, consent, communications and retention obligations; implement appropriate access/privacy | P: owner-approved policy register and configuration before real data; unresolved policy prevents production activation |
| 29 | V1, V1.5, V2, V3 roadmap | P/O/A/F: track each release separately; V2 online booking/forms/portal and V3 AI/forecasting/advanced analytics are explicitly retained below |
| 30 | Search → booking → arrival → alert review → clinical note → plan → charge/payment/receipt → follow-up → timeline → daily close | P: integrated test and witnessed staff demonstration; unavailable image/advanced modules must not be represented as complete |
| 31 | Fifteen clinic decisions | Day 1: decision register in section 10; owners and due dates recorded |
| 32 | Observe, prototype, pilot, daily use, review | Observation/prototype begin Day 1, synthetic-data demonstration Day 7; controlled pilot and daily-use expansion follow completion of all P release gates |
| 33 | Duplicate override, audited overlaps, traceable payments, clinician attribution, auditable corrections, tested restore, no outage loss, efficient journey, permission boundaries, report reconciliation | P: release-blocking acceptance suite below; repeat for later modules |
| 34 | Validate core workflow with dentist/reception before automation | All releases: clinic sign-off is required at each gate |

## 4 Technical structure

Use one deployable application with internal modules and one relational database. Avoid splitting this small initial product into independently deployed services. Prefer your familiar framework. A reasonable default, if you are already comfortable with it, is a TypeScript web application, PostgreSQL, private object storage, established authentication, and a small background worker for backups/notifications as needed. Framework and hosting selection must account for the confirmed data policy; no provider, price or hosting location is assumed approved.

Build the application around patients, scheduling, clinical care, finance and follow-ups. Later modules use those records rather than creating their own patient copies. The patient workspace should keep overview/alerts, appointments, visits, plans, accounts, follow-ups and timeline together. Add chart, files, consent, prescriptions and labs as their modules become available.

Core data groups:

| Group | Records and important constraints |
|---|---|
| Organization and identity | Clinics, branches, users, memberships, roles/permissions, dentists, chairs, clinic hours, security settings; branch scoping enforced in queries |
| Patient | Patients, contact preferences, history/alerts, identifiers; internal immutable ID plus readable clinic ID; archive without breaking references |
| Scheduling | Appointments, appointment events, procedure durations; start/end/timezone, dentist/chair, status, next action, override reason; concurrency control on contested slots |
| Clinical | Visits, note revisions, diagnoses, performed procedures, tooth references, template versions; dentist attribution; final notes corrected by amendment |
| Planning | Treatment plans, items, item status history, estimate versions; procedure/price snapshot; completed visit procedures linked to plan items |
| Finance | Charges and lines, discounts/credits, payments, allocations, refunds, receipts, cash movements, closings, expenses; decimal or integer minor units; currency fixed per ledger |
| Operations | Follow-ups/recalls, communication events, tasks/assignees; due date and contact outcomes retained |
| Later depth | Files/tags, prescriptions/approvals, consent form versions/signatures, labs/vendors, inventory lots and movements |
| Control | Audit events, idempotency keys, import batches, export events, backup checks; object/version references and request IDs |

Do not implement a single mutable balance field as the financial source of truth. Derive balances from posted entries and allocations. Do not store patient or clinical content in ordinary application error logs. Signed documents and clinical amendments need protected history beyond a generic updated-at timestamp.

Enforce authorization on each server request, including search, counts, timeline, exports and file downloads. Deny access unless explicitly allowed; UI hiding is only a convenience. This follows the principles in the [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

Use transactions, locking where appropriate, and unique idempotency keys for operations such as payment-plus-receipt and concurrent booking validation. Retrying a request must not create a second payment. Concurrency needs deliberate application design; see [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).

Later attachments should use private storage, generated filenames, allowed file types, validated content and limits, malware controls appropriate to the deployment, and short-lived authorized access. Avoid permanent public URLs. See [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

## 5 Business rules to settle before coding

**Patients.** Normalize phone numbers but do not make phone globally unique: relatives can share a number. Search likely duplicates using phone/name and available DOB or identifiers. Show candidate records before creation; an explicit permitted override records the reason. Never merge automatically. Unknown demographics remain unknown.

**Appointments.** Proposed main flow: Booked → Confirmed → Arrived → Waiting → In Treatment → Completed. Allow clinic-approved shortcuts such as Arrived → In Treatment. Cancellation/no-show/reschedule require valid prior states. Preserve transitions and actor/time. Validate duration, clinic hours and dentist/chair availability on the server; check again inside the booking transaction. Authorized overlap requires a reason. Outstanding balance is visible but does not automatically block care.

**Clinical notes.** Separate draft from finalized. Associate the responsible clinician with each entry; assistants cannot finalize on a dentist's behalf. Record note revisions and amendment reasons. Tooth coding must include numbering system and dentition so the later chart does not reinterpret historical teeth. Visible medical alerts come from the patient record; they must not disappear when navigating to a visit.

**Treatment plans.** Status belongs at item level as well as a derived plan summary. A partially completed plan cannot be marked fully complete because one item was completed. Link performed procedures to accepted plan items where relevant. Store prices/discounts at acceptance; subsequent catalog price changes do not rewrite historical estimates.

**Finance.** Agree whether a charge becomes due when posted or at another clinic-defined event. Proposed model: receivable = posted charges − discounts/credit notes − net payment allocations. Refunds reverse the relevant payment allocation; a credit note separately reduces charges when services are cancelled. Do not subtract a refund from receivables without considering its allocation and any related credit note.

Example in illustrative currency units: charge 10,000, discount 1,000, payment 4,000 → due 5,000. Refund 1,000 of that allocated payment without changing the charge → due 6,000. If the refund accompanies a 1,000 service credit, due remains 5,000. Test both cases. Keep customer credit/overpayment distinct from revenue and due balances.

**Cash closing.** Expected cash = opening float + cash receipts − cash refunds − cash expenses + other documented cash-in − other documented cash-out. Variance = counted cash − expected cash. Non-cash methods reconcile separately. Close by branch and business date with a defined cutoff; admin approval locks the snapshot. Later adjustments preserve the approved original. Define whether a second person must approve or whether owner self-approval is permitted in a small clinic.

**Reporting.** Define a new patient by first completed visit or another agreed event—not whichever query is easiest. Define aging from charge due date and use agreed buckets, proposed 0–30/31–60/61–90/90+ days. Collections and revenue are different measures. A cash-basis net summary is collections less refunds and paid expenses, not an assertion of accounting profit. Labs and inventory purchases must not be counted again when already recorded as expenses.

## 6 Seven day solo execution plan

This is a 42-hour core demonstration sprint. It deliberately does not claim that the entire P release, much less V2/V3, is complete after seven days. Preserve the coverage map as the full requirement register. No deferred feature is marked done.

| Day | Six hour work budget | Concrete output | Exit check |
|---|---|---|---|
| 1 | 1h clinic decisions and workflow; 2h project/auth/staging; 2h schema and permission foundation; 1h smoke tests | Login, role-aware shell, patient/appointment/visit/finance schema and migration, audit foundation | Unauthorized API request fails; staging starts from documented setup; unknown policy decisions are recorded |
| 2 | 2h patient create/search/profile; 2h day schedule and booking; 1h duplicate/status validation; 1h tests | Search/create → book → arrive, with patient ID, basic history and allergies | Shared phone and duplicate warning tested; appointment events retained; unresolved overlap/concurrency defects recorded |
| 3 | 2h visit editor and structured teeth; 1h approved routine template; 1h plan items/status; 1h attribution/revisions; 1h integrated tests | Dentist records complaint, diagnosis, tooth/procedure, note and treatment plan | Alerts visible; changes retain responsible clinician; record reopened successfully |
| 4 | 2h charges/discounts/partial payment; 1h receipt print; 1h idempotency/permissions; 2h reconciliation tests | Charge → payment → receipt → balance works for synthetic patients | Known totals match, repeat submit does not duplicate payment; do not claim refund/closing complete unless separately tested |
| 5 | 2h follow-up/recall list and assignment; 1h dashboard; 1h basic timeline/manual communication; 1h core totals; 1h journey test | End-to-end core journey without advanced modules | Appointment → note → plan → payment → follow-up succeeds; dashboard agrees with records |
| 6 | 2h role/audit checks; 1h backup setup; 1h actual restore; 1h network-loss characterization; 1h critical fixes | Test evidence and a specific list of readiness failures | Restore verified; outage failures identified honestly; no unsupported promise of offline capability |
| 7 | 2h staff demo with synthetic data; 2h highest-priority fixes; 1h requirements audit; 1h handover and re-estimation | Demonstrable core system, test results, known gaps and next sprint backlog | Every item labeled passed/failed/not implemented; no real patient rollout unless all core release gates independently pass |

Use the framework you already know. Keep the first UI functional and simple. Build one workflow through UI, server, database, permissions and audit before adding the next. Commit working changes at least daily and use staging from Day 1.

If Day 2 registration/booking is unstable, spend Day 3 fixing it rather than adding a chart. If financial arithmetic or permissions fail, resolve those before reports. Day 7 still produces a reviewable build and an accurate status report; it does not justify calling incomplete features complete.

Following this sprint, finish the P release: all appointment edge cases/day-week calendar and overrides; full core role matrix; refunds/credits/corrections; cash closing/basic cash expenses; complete core reports; validated limited outage behavior; migration; device/printer tests; and the full acceptance suite. Then run the controlled pilot.

Critical path for real use: approved workflow/data rules → identities and permissions → patient/booking → clinical visit/plan → charge/payment/receipt → closing/reconciliation → recovery/outage testing and staff acceptance → pilot. External approvals and clinic reviews cannot be compressed by generating code faster.

### How to use AI during the week

For each task, provide the relevant requirement IDs, schema, allowed role actions, business rules and acceptance examples. Ask for one bounded implementation, review the diff, run the tests and inspect the actual UI before proceeding. Have AI generate adversarial cases such as double payments, shared family phone numbers, unauthorized direct API requests and conflicting note edits. Use anonymized fixtures, not real patient data, in development prompts.

A useful task brief is: “Implement PRD sections 5 and 6 for returning-patient booking using the current schema. Include duplicate candidates and an explicit override, server-side permissions, appointment audit events and tests for concurrent requests. Do not mark the task complete until the specified tests pass.” Adapt the scope to fit one reviewable change.

## 7 Effort and feasibility

These are initial engineering estimates, not a quotation. Re-estimate after Day 1 and after inspecting any reusable codebase. They assume simple UI, familiar tooling and the complete P release above, not just the seven-day demonstration subset.

| Pilot work package | Developer hours |
|---|---:|
| Foundations, role controls, audit and staging | 16–20 |
| Patient master, search and appointment workflow | 22–28 |
| Visits, alerts, basic templates and treatment plans | 22–28 |
| Charges, payments, receipts, refunds, basic expenses and closing | 26–34 |
| Follow-ups, manual communications, timeline, dashboard and core reports | 18–24 |
| Limited outage support, recovery, import and deployment | 16–22 |
| Integration fixes and regression support | 16–24 |
| **Total developer effort** | **136–180** |

Additional effort: approximately 35–45 QA hours and 8–12 combined clinic-review hours. As a solo developer, plan to perform the QA work as well: 171–225 hours before clinic review and contingency. At 30 focused hours per normal five-day week, that is about 6–8 working weeks for the complete core pilot. Proven reuse and a successful first sprint can reduce the remaining estimate; do not count work twice when re-estimating.

Your seven-day capacity is approximately 42 focused hours. The complete P release alone requires roughly four to five times that capacity including QA, before the V1.5, V2 or V3 backlog. Even three developers at six focused hours per day would supply only 126 developer hours in seven days against 136–180 estimated developer hours, plus separate QA needs. This is why simply adding AI or a small team does not substantiate an all-roadmap one-week promise.

If the seven-day date is fixed, the available outcome is a core demonstration or evaluation/configuration of an existing product. An existing product would require a requirement-by-requirement gap analysis, licensing/data-hosting review, migration and acceptance; no product has been assessed here and full coverage cannot be assumed. If all custom requirements are fixed, extend the schedule. If production readiness is fixed, keep the release gates.

To reduce the gap without dropping a requirement, use proven authentication, a familiar CRUD scaffold, existing calendar components, print styles, a common table/filter component, and a small approved template set. Keep custom visual styling modest. Safety/reconciliation/recovery work is not optional schedule padding.

## 8 Outage and recovery contract

The PRD permits defined essential functions during a temporary interruption; it does not define them. Proposed pilot contract for clinic-approved, managed devices:

1. Cache the application shell and the current day's minimal schedule/identifiers after a successful authorized load. Display the cache timestamp and a prominent offline indicator. Do not expose full clinical notes to reception through this cache.
2. Persist an in-progress clinical draft on the authorized device as it is edited, with visible saving/saved-local/synced/failed states. Detect unavailable browser storage or quota errors and warn before allowing reliance on offline drafting. Never label local data as backed up.
3. Allow offline reading of approved cached essentials and recovery/editing of an existing draft. Do not allow offline financial posting, new bookings, patient registration, signed notes, permission changes or destructive actions in this pilot scope.
4. Reconnect with a stable draft ID and version; reauthorize, compare server versions, show conflicts for clinician resolution, and send idempotently. Never silently replace a newer clinical note. Pending drafts remain clearly visible until confirmed saved on the server.
5. Define cache expiration, logout clearing and device-loss policy. Pending sensitive drafts need an explicit secure handling decision before logout; role revocation cannot be assumed instantly enforceable on a disconnected device. If the clinic cannot accept this residual device risk, offline clinical drafts need a different architecture and a revised estimate.
6. Test network loss during typing, refresh, reconnect, duplicate retries and a competing server edit on each target browser. Browser storage can be cleared or evicted; this scope addresses temporary connectivity interruption on tested devices, not a guarantee against device failure or manual browser-data deletion.

Service workers support offline application delivery and IndexedDB supports structured local storage, but neither provides application-level authorization or conflict resolution automatically. See [MDN service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) and [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB).

Proposed recovery targets for clinic approval: maximum 1 hour of server-side data loss and restore within 4 hours. Select and test a backup/PITR configuration capable of those targets; a nightly backup alone does not meet a one-hour target. Back up object files and necessary configuration as well as the database, encrypt backups, restrict access, and monitor failures. Retention duration remains an owner decision. Restore into a separate environment, verify record counts, receipts, attachments when present, permissions and a sample visit, then record measured results. [PostgreSQL documents dump, filesystem backup and continuous archiving approaches](https://www.postgresql.org/docs/current/backup.html).

## 9 Acceptance tests and release gates

Each requirement ticket must include owner, release, prerequisite, acceptance steps and evidence. Mark completion only after the workflow, server permission checks, relevant audit events and tests pass on staging. Later modules remain open; a database table alone does not count as delivery.

| Test | Expected result |
|---|---|
| AT01 Existing patient | Search by ID/name/normalized phone finds the correct person; booking retains the existing patient ID |
| AT02 Duplicate and shared phone | Likely duplicate warns; authorized explicit override is logged; a family member can be a separate patient without automatic merging |
| AT03 Scheduling race | Two users contest a slot; unapproved overlap is prevented; an authorized override requires reason and audit; day/week views agree |
| AT04 Appointment history | Confirm, arrive, wait, treat, complete, cancel, no-show and reschedule preserve valid state transitions and original history |
| AT05 Clinical integrity | Alerts remain visible; tooth/diagnosis/procedure recorded; responsible dentist preserved; final-note amendment leaves old text traceable |
| AT06 Plan progress | Proposed/Explained/Accepted/Rejected/Deferred/In Progress/Completed work at item level; partial completion preserves remaining work; care is not blocked by an outstanding proposal |
| AT07 Financial arithmetic | Charge/discount/partial payment/credit/refund scenarios match approved examples; every receipt links patient, amount, method, user and timestamp |
| AT08 Retry and concurrent finance | Double-click/retry posts once; concurrent refunds cannot exceed eligible amounts; receipt retries reuse the same transaction |
| AT09 Close and adjust | Expected and actual cash reconcile; variance requires explanation; approval locks the day; later correction preserves the approved snapshot |
| AT10 Follow-up and recall | Due/upcoming/overdue dates, assignment, all statuses, booked appointment links and communication outcomes work |
| AT11 Role boundaries | Each role's allowed tasks pass; restricted API, guessed record/file ID, search, dashboard and export access fail without leaking data |
| AT12 Audit | Appointment, clinical, money, permission and export changes identify actor/time/action; later prescriptions and consents satisfy the same rule; ordinary admin cannot erase history |
| AT13 Recovery | Actual restore succeeds within agreed targets; missing backup triggers an alert to the designated operator |
| AT14 Internet interruption | Already-entered draft survives the agreed interruption/refresh test; reconnect does not duplicate or silently overwrite; unavailable offline actions are clearly blocked |
| AT15 Reports | Known seeded records reconcile to daily/monthly totals and balances; clinic timezone boundaries, cancelled bookings and refunds are handled correctly |
| AT16 Import | Invalid rows are reported, duplicate candidates reviewed, source IDs retained, dry-run and committed counts/balances agree; no silent overwrites |
| AT17 Staff journey | Receptionist and dentist complete booking → visit → payment → receipt → follow-up; owner/cashier close the day without developer intervention |
| AT18 Performance and devices | Proposed targets: returning-patient search/book within 60 seconds, routine approved template note within 3 minutes, schedule p95 under 2 seconds on agreed clinic hardware/network; measure against a declared pilot-size dataset |

Suggested test dataset: 100 synthetic patients, 200 appointments spanning statuses, 30 visits, multiple partial plans, refunds and shared phones; include historical balances and date boundaries. For performance, additionally test at the clinic's expected year-one scale, provisionally 10,000 patients and 50,000 appointments until real volumes are known. These are test assumptions, not claims about clinic size.

Release gate: all required pilot tests pass; no unresolved defects involving unauthorized access, clinical attribution, incorrect money, lost records or broken essential workflow; backup/restore demonstrated; staff trained; policies confirmed; owner and dentist sign off. An unfinished required feature means the pilot scope or date must be formally revisited.

During deployment, take a pre-migration backup, use tested reversible or backward-compatible migrations, and verify health before staff entry. If application rollback is needed after new transactions exist, preserve those transactions; do not blindly restore an older database and erase new work. Keep a clinic-approved downtime register and reconciliation procedure ready.

## 10 Day one decision register

Resolve these with anonymized examples and actual devices. Record decision, owner, date and any effect on scope.

| PRD decision | Owner | Needed by |
|---|---|---|
| 1 Dentists, chairs, locations, staff schedules | Owner/reception | Before schema and calendar implementation |
| 2 Mandatory paper-card fields | Reception/dentist | Before patient form implementation |
| 3 Tooth numbering and chart preference | Dentist | Before storing first tooth record; chart design before O release |
| 4 Frequent procedures and templates | Dentist | Day 1; supply 2–3 pilot templates |
| 5 Prices, discounts, partial payments, refunds, deposits | Owner/accountant | Before finance implementation |
| 6 Who creates, edits and approves finances | Owner | Before role permissions are finalized |
| 7 Essential history and consent fields | Dentist/owner | Before real clinical use; signed digital consent before O release |
| 8 Routine follow-ups and recalls | Dentist/reception | Before Day 4 |
| 9 Messaging provider and consent process | Owner | Manual policy before pilot; provider onboarding before A release |
| 10 Historical digitization range | Owner/reception | Before import; active-only pilot proposed |
| 11 Devices, browsers, printer, connectivity | Reception/technical lead | Day 1 |
| 12 Exact downtime functions | Owner/dentist/technical lead | Day 1; changes can materially extend schedule |
| 13 Retention, exports and authorized people | Owner with appropriate policy advice | Before real data |
| 14 Multi-branch now or future | Owner | Day 1; current multi-branch changes this plan |
| 15 Daily/weekly/monthly reports and definitions | Owner/accountant | Day 1 for pilot measures; full catalog before O release |

Also confirm your familiar stack, hosting budget/data location, currency/timezone, expected volumes, security policy and backup targets. Your solo/fresh-build/all-roadmap target is confirmed; the proposed demonstration milestone remains an alternative to that target. Do not infer jurisdiction merely from the listed payment methods.

## 11 Complete delivery after the pilot

The following is an indicative dependency sequence, not a fixed promise. Estimate each batch after pilot feedback. For a solo developer, use these initial effort allowances, including implementation/testing, at 30 focused hours per normal week:

| Release | Additional effort | Indicative duration |
|---|---:|---:|
| Complete core P release | 171–225h total, including work already done in the demo | About 6–8 weeks total |
| O operational depth | 180–300h | About 6–10 additional weeks |
| A automation and patient access | 120–210h | About 4–7 additional weeks |
| F multi-branch and advanced capabilities | 180–360+h | About 6–12+ additional weeks |
| All releases | 651–1,095+h before contingency | About 22–37+ working weeks |

These broad estimates are judgment-based planning ranges, not vendor benchmarks. Add 20–30% contingency until the unspecified V2/V3 stories are agreed; do not represent the upper bound as a guarantee. Provider approvals and policy decisions can add elapsed time. AI may reduce measured effort, but reforecast based on accepted working increments, not code volume. A substantially smaller “advanced” definition or strong reusable foundation could reduce the range; a diagnostic image viewer or extensive offline creation would expand it.

| Batch | Work retained from PRD | Gate |
|---|---|---|
| O1 Clinical depth | Validate numbering; adult/pediatric interactive chart and tooth history; private image/document gallery and comparison; full procedure templates; estimate versions/PDF; prescriptions with dentist approval; consent versions/signatures | Dentist validates each workflow; historic documents unchanged; file/print/share permissions verified |
| O2 Operational depth | Full expenses/approvals/attachments; lab cases and overdue/cost/payment history; inventory lots/expiry/movements/suppliers; complete timeline and communication templates | Stock, lab costs and expenses reconcile; each status transition and alert tested |
| O3 Reporting and usability | Every section 22 report; remaining filters/widgets; optional chair utilization, deposit rules and procedure consumption if selected; complete operational training | Reports reproduce source transactions and staff can use all roles without workarounds |
| A1 Messaging and recalls | WhatsApp/SMS providers, approved templates, reminders, automated recalls, consent/opt-out, delivery outcomes, retry/idempotency and quiet hours | Provider access approved; duplicate sends and unauthorized sends prevented; failed delivery visible |
| A2 Patient access | Online booking, digital patient forms, patient portal | Availability rules, identity verification, patient isolation, form review, consent and abuse protection tested; public submissions do not silently alter signed clinical history |
| F1 Multi-branch | Separate schedules/chairs/staff permissions/financial reports; controlled shared patient records and branch assignment | Cross-branch access and reporting tests pass with representative clinic scenarios |
| F2 Advanced capabilities | Advanced analytics, AI-assisted administrative/clinical documentation with dentist review, inventory forecasting, advanced finance analytics | Define exact metrics, data quality thresholds and acceptance first; AI drafts require clinician review and must not independently select medication/dose |

The V2/V3 entries are high-level roadmap statements, not fully specified features. Before implementation, create detailed user stories: for example, which records patients may view, how booking is approved, which forecasting horizon matters, and what AI inputs/outputs are allowed. A claim to fulfill these broad requirements without that definition would be unverifiable.

## 12 Handover and ongoing operation

Deliver source repository and setup instructions; schema/migration history; environment-variable names without secrets; permission matrix; requirement-to-test register; automated test results; staff quick guides; import validation report; backup/restore evidence and runbook; closing and correction procedure; deployment/rollback runbook; named support owner; and a release backlog with every deferred PRD item.

After all P release gates pass, start the live pilot with a clinic-agreed small number of visits. Day 7 of the solo sprint remains a synthetic-data demonstration unless those gates have genuinely all been met. Check each clinical record and receipt, then reconcile the full close. During the first operating week, review errors, missing follow-ups, backup status and workflow friction daily. Expand usage only after consistent successful sessions. Assign one source of truth for transactions so parallel paper fallback does not result in double entry.

The recommended commitment for your confirmed situation is a working core demonstration in seven days and a staged path to all requirements. Delivering everything from V1 through V3 as a validated fresh build, solo, within that same week is not a feasible commitment. Preserve the full requirement register and re-estimate weekly from verified progress.
