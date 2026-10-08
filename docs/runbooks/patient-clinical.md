# Patient history and alerts

From Patients, open the patient profile. Medical history and alerts belong to the selected branch. Existing clinical visit pages show the latest loaded history and active alerts alongside the note, clearly separate from the signed note’s historical text. Reload current patient history to refresh this view without replacing the visit form.

History reviews record medical/dental history, medications, allergies, tobacco history, information source, review date and a reason. Blank fields mean not recorded. Staff must enter the record; no clinical facts or medication decisions are generated. Future review dates are rejected. Every save creates an immutable version; old versions remain available, and stale edits require reload.

Alerts have staff-selected type/severity/text and active/resolved status. Create starts active; edit, resolve and reactivate preserve immutable prior versions and attribution. No delete operation exists. The visit summary shows up to 50 active alerts, ordered critical/important/informational; if more exist it states the total and directs staff to paginated profile records. The profile supports active/resolved/all filters, 50 per page, and the latest 50 alert/history revision entries. Older history versions remain retrievable individually.

Read requires patient.demographics.read and patient.clinical.read. Writes additionally require patient.clinical.write. Permission definitions do not grant actual staff access, and owner status does not imply clinical authority. Clinical data never enters demographic DTOs. Cross-branch history sharing remains a clinic policy/design decision; this implementation does not silently expose another branch’s medical records.

APIs: GET/POST `/api/v1/patients/:id/clinical`; GET `/clinical/history/:version`; GET/POST `/clinical/alerts`; GET/PATCH `/clinical/alerts/:alertId`, under the same patient prefix. Writes require configured Origin, stable operationId and reason; history/alert changes require expectedVersion. Responses are private/no-store. History bodies are capped at 60 KiB and HTTP history requests at 64 KiB. Business changes, immutable versions and audit commit together.

Verification: `pnpm test:patient-clinical` and rollback-only `pnpm db:verify-patient-clinical`. These verify scope/permission, conflict/replay handling, audit rollback and signed-note preservation, without real clinical records or account grants. Clinician review of fields, warnings, visibility and workflow remains an acceptance gate.
