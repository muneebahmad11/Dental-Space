INSERT INTO clinic_app.permissions(key, description) VALUES
 ('patient.demographics.read','Read scoped patient demographics'),
 ('patient.demographics.write','Create and update scoped patient demographics'),
 ('patient.clinical.read','Read authorized clinical records'),
 ('visit.draft.write','Write clinical drafts'),
 ('visit.finalize','Finalize as an authorized clinician'),
 ('payment.post','Post payment entries'),
 ('closing.approve','Approve daily closing'),
 ('user.manage','Manage staff access'),
 ('audit.read','Read scoped audit events');
--> statement-breakpoint
GRANT SELECT ON clinic_app.permissions, clinic_app.roles, clinic_app.role_permissions,
 clinic_app.membership_roles, clinic_app.membership_grants TO clinic_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON clinic_app.audit_events TO clinic_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON clinic_app.patients TO clinic_runtime;
--> statement-breakpoint
CREATE FUNCTION clinic_app.reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit events are append-only' USING ERRCODE = '42501'; END $$;
--> statement-breakpoint
CREATE TRIGGER audit_no_update_delete BEFORE UPDATE OR DELETE ON clinic_app.audit_events
FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON clinic_app.audit_events
FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
