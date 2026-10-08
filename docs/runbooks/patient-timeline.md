# Patient timeline

From **Patients**, choose **Timeline** for the patient. It shows newest activity first and links to the relevant visit, plan, receipt/refund, billing account or follow-up. Appointments and communications link to their module views. Date filters use activity time in the clinic timezone. Billing business dates, performed dates and follow-up due dates are shown separately; a backdated payment does not move its recording event into that earlier timeline day.

## Visibility

Demographic read is required for the patient and timeline. Patient registration belongs to the clinic-wide patient master. All other events are selected-branch operations.

| Category | Additional access |
|---|---|
| Appointments | appointment.read |
| Clinical visits | patient.clinical.read |
| Treatment plans/completions | patient.clinical.read and plan.read |
| Billing/receipts/refunds | billing.read |
| Follow-up/contact history | patient.clinical.read and followup.read |
| Communications | communication.read |

Unavailable categories are excluded completely, including counts/previews, rather than shown as zero activity. Explicit requests for an unavailable category return 403. Every request resolves fresh active membership/grants. Generic audit.read is not required because the service exposes only authorized domain activity from a fixed allowlist, never arbitrary audit history or permission changes.

Summaries omit clinical note bodies, prescription-like text, refund reasons, message parameters/recipient phone, consent evidence and operation hashes. Estimates include their authorized title/total. Open the full source record under its own permission checks for details. Message provider submission, delivery and read states remain separate. Activity from modules that do not yet exist is not fabricated.

## API and consistency

GET `/api/v1/patients/:patientId/timeline` accepts `category=all|demographics|appointments|clinical|plans|billing|followups|communications`, optional ISO `from`/`to`, and an opaque `cursor` returned as `nextCursor`. Use the existing verified session and clinic/branch headers. Responses are private/no-store.

Each page contains up to 50 entries from a repeatable-read snapshot, ordered by full PostgreSQL event timestamp and a globally unique source-prefixed key. Cursor comparisons retain microseconds rather than rounding to JavaScript milliseconds. Scope and permissions are checked again for every page. New activity can appear between page requests; refresh to restart at the newest events. The timeline is a live authorized view, not a persistent historical export.

Appointment/draft activity comes from current domain audit events; signed notes/estimate versions and follow-ups use their immutable records. Registration metadata has no actor field on the patient row and is labeled Clinic record. Provider/worker outcomes have a provider/worker label instead of attributing them to a staff action. Fees are labeled amounts of charges/payments/refunds, not profit or reconstructed balances.

`pnpm db:verify-timeline` uses rollback-only synthetic sources and verifies module coverage, narrow DTOs, role/branch/patient isolation, timezone boundaries, microsecond cursor ordering, multi-page no-duplicate coverage and permission revocation. It sends no messages. CI also runs `pnpm test:timeline`.

Future work: files/prescriptions/consents/lab event integration, complete appointment reschedule/status history, general manual communications outside follow-ups, query performance on representative clinic volumes, and full browser/staff acceptance.
