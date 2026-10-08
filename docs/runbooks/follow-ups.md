# Follow-ups and preventive recalls

Open `/follow-ups`. Create an unlinked patient follow-up, or choose **Create linked follow-up** in a clinical visit. Pick the named type or Custom, due date, eligible assigned staff and a reason. Scaling recall and periodic check-up are manual preventive recall records; automatic repeat schedules are not enabled.

Filters show today/upcoming/overdue using the clinic timezone, open/all/specific statuses and assigned staff. Lists have 50 rows per page. The details panel shows the latest 100 history entries with actor/time/note. Contact attempts log actions already taken; selecting WhatsApp/SMS/Email does not send anything. Set Contacted or Unable to Reach explicitly after recording the outcome.

Statuses are Due, Contacted, Booked, Completed, Closed and Unable to Reach. Open states may move to a different open state or finish as Completed/Closed, with a required reason. Finished records are immutable in this slice; create a new follow-up when further care is needed. Booking only means an appointment is linked, not that treatment was completed. Returning a booked item to Due clears its current appointment projection while preserving the prior link in immutable history. It does not cancel the original appointment: review/cancel that booking separately before creating another one.

The booking form uses device-local input times, saves exact instants and displays linked times in the clinic timezone. It reuses scheduling conflict/retry rules. A cancelled linked appointment remains visible to authorized appointment readers; review it and return the follow-up to Due if another booking is needed. Contacting or completing a follow-up does not sign a clinical note or post charges.

## Access

`followup.read`, `patient.demographics.read` and `patient.clinical.read` are required to view records and notes. `followup.write` additionally permits creation, due-date/assignment edits, contact logs and explicit status changes. Booking requires appointment read/write as well. Assignees must be active clinic/branch staff with follow-up, clinical and demographic read access. This first implementation keeps potentially clinical follow-up notes behind clinical read; a receptionist-specific limited DTO requires an approved clinic visibility policy. Permission definitions do not grant any actual account access.

## API

- GET/POST `/api/v1/follow-ups`: filters `bucket=all|today|overdue|upcoming`, `status=open|all|<status>`, optional `patientId`, `assigneeId`, `offset`. POST accepts `operationId`, `patientId`, optional `visitId`, `type`, `customType`, `dueOn`, `assigneeId` and `note`.
- GET `/api/v1/follow-ups/staff`: eligible assigned staff (up to 100).
- GET/PATCH `/api/v1/follow-ups/:id`: detail or versioned action. PATCH requires `operationId`, `expectedVersion`, `note` and action `edit`, `transition` or `contact` with its allowlisted fields.
- POST `/api/v1/follow-ups/:id/book`: `operationId`, `expectedVersion`, future offset ISO `startsAt`/`endsAt`, `note`. Creates and links a booking atomically.

Writes require the configured Origin and stable operation UUIDs; changed payloads on retries return conflicts. Booking an existing appointment through the transition API requires a live same-patient/branch appointment and appointment read access. Neither linking nor transition automatically cancels the previous booking.

## Verification and open work

`pnpm test:follow-ups` checks date buckets, status rules and validation. `pnpm db:verify-follow-ups` uses rollback-only synthetic SQL fixtures for scope, assignment access, retries, stale edits, contact history, atomic booking/audit failures, completion/closure and revoked access. CI runs both. No real contact is made and no account permissions are changed.

Timeline integration for current modules is implemented. Reminder/recall automation, historical contact timestamps, terminal corrections, broader manual communications, reviewed receptionist visibility and separate-connection booking race/browser acceptance remain open.
