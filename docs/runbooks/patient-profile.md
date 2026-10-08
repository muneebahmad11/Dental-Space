# Patient demographic profile

Patients → Profile opens the clinic patient master and, when permitted, the selected branch’s clinical history. Name/primary phone/email are still edited through the patient directory. Profile fields add DOB or reported age/as-of date, gender as reported, address, alternate phone, emergency contact name/phone/relationship and active/inactive/archived status.

Unknown DOB remains null. Reported age is stored with its reported-on date; the application never derives a fabricated DOB or silently increases the stored age. DOB and reported-age dates cannot be future-dated. These optional fields remain subject to the clinic’s mandatory-field acceptance. Date-only values are validated ISO strings within immutable demographic snapshots and are never converted into timezone-dependent timestamps.

Reading requires patient.demographics.read. Saving also requires patient.demographics.write. Transitioning into or out of Archived requires patient.archive. Permission definitions do not grant actual accounts access. Archive preserves the patient and all related records; it is a retained administrative status, not deletion or an automatic prohibition on clinical care or existing financial operations. Scheduling archive policy remains a clinic decision.

GET/POST `/api/v1/patients/:id/profile` uses verified session/scope headers. Writes require configured Origin, stable operationId, expectedVersion and reason. Shared clinic-master updates serialize by patient and preserve immutable versions. The profile shows the latest 20 revisions, including past values and attribution. Demographic DTOs do not contain medical history or alerts.

Patient search includes normalized primary/alternate phone digits, so formatting differences do not hide existing records. Shared phone numbers remain permitted and are not automatically merged. Registration now requires reviewing possible matches; an explicit reason and patient.duplicate.override permission are required to create a separate record despite matches.

`pnpm test:patient-profile` and rollback-only `pnpm db:verify-patient-profile` verify date/age/contact validation, version preservation, archive/restore permissions (including retries after revocation), phone search, scoped access and audit rollback. No actual patient or account permission is modified by these checks.
