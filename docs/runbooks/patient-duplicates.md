# Duplicate registration review

Registration looks for same-clinic records with a case-insensitive exact name or a matching primary/alternate phone after removing punctuation. Up to 10 possible matches are shown, with an indication if more exist. Open an existing profile before deciding whether a new person is needed. Matches are review candidates, not verified identity; country/local-prefix conversion and fuzzy name matching are not inferred.

Shared family phones remain allowed. To deliberately create a separate patient despite matches, staff need patient.demographics.read/write and patient.duplicate.override, plus a required reason. No merge is automatic. Actual accounts do not receive override permission merely because its catalog definition exists. If the account lacks it, use the matching record or ask an authorized clinic administrator for the proper workflow.

GET `/api/v1/patients/duplicate-candidates?name=...&phone=...` returns narrow demographic candidates, hasMore and canOverride. POST `/api/v1/patients` accepts optional `duplicateOverride: {reason}` alongside ordinary demographics and operationId. Callers cannot supply candidate IDs. The server repeats matching inside the registration transaction and locks registration per clinic; direct API calls do not bypass review. No-match registration needs no override.

Original operation replay is handled before duplicate checking. Stable matching retries retain the original patient ID, including after a lost response. The UI requires resolving an ambiguous original request before changing its patient details. Reusing an operation ID with changed content fails. An elevated override retry rechecks current override permission.

Override evidence stores actual matched IDs (first 10), a more-candidates flag, staff identity, branch, reason and timestamp. Evidence rejects update/delete/truncate. Patient creation, review evidence and audit commit together. The timeline adds generic review metadata without exposing the reason or other patients’ IDs.

`pnpm test:patient-duplicates` and rollback-only `pnpm db:verify-patient-duplicates` verify matching, scope, explicit grants, shared-phone retention, replay handling and audit rollback. Independent-connection race evidence, edit-time duplicate policy, imports and clinic acceptance remain open. Initial registration currently requires name/primary phone; expanded optional fields are recorded through Profile after registration.
