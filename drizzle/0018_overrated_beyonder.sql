CREATE TABLE "clinic_app"."patient_alert_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"alert_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"reason" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "alert_version_unique" UNIQUE("alert_id","version"),
	CONSTRAINT "alert_version_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "alert_revision_positive" CHECK ("clinic_app"."patient_alert_versions"."version">0),
	CONSTRAINT "alert_reason" CHECK (length(trim("clinic_app"."patient_alert_versions"."reason")) between 3 and 500)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."patient_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "patient_alert_scope_unique" UNIQUE("clinic_id","branch_id","patient_id","id"),
	CONSTRAINT "patient_alert_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "patient_alert_version" CHECK ("clinic_app"."patient_alerts"."version">0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."patient_history_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer NOT NULL,
	"reason" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "history_patient_version_unique" UNIQUE("clinic_id","branch_id","patient_id","version"),
	CONSTRAINT "history_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "history_version_positive" CHECK ("clinic_app"."patient_history_versions"."version">0),
	CONSTRAINT "history_reason" CHECK (length(trim("clinic_app"."patient_history_versions"."reason")) between 3 and 500)
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_alert_versions" ADD CONSTRAINT "alert_version_parent_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","alert_id") REFERENCES "clinic_app"."patient_alerts"("clinic_id","branch_id","patient_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_alert_versions" ADD CONSTRAINT "alert_version_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_alerts" ADD CONSTRAINT "alert_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "clinic_app"."patients"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_alerts" ADD CONSTRAINT "alert_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_alerts" ADD CONSTRAINT "alert_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_history_versions" ADD CONSTRAINT "history_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "clinic_app"."patients"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_history_versions" ADD CONSTRAINT "history_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_history_versions" ADD CONSTRAINT "history_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_alert_patient_idx" ON "clinic_app"."patient_alerts" USING btree ("clinic_id","branch_id","patient_id");--> statement-breakpoint
INSERT INTO clinic_app.permissions (key,description) VALUES ('patient.clinical.write','Record reviewed medical history and patient alerts') ON CONFLICT DO NOTHING;
--> statement-breakpoint
GRANT SELECT,INSERT ON clinic_app.patient_history_versions,clinic_app.patient_alert_versions TO clinic_runtime;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON clinic_app.patient_alerts TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER history_versions_immutable BEFORE UPDATE OR DELETE ON clinic_app.patient_history_versions FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER history_versions_no_truncate BEFORE TRUNCATE ON clinic_app.patient_history_versions FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER alert_versions_immutable BEFORE UPDATE OR DELETE ON clinic_app.patient_alert_versions FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER alert_versions_no_truncate BEFORE TRUNCATE ON clinic_app.patient_alert_versions FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER patient_alerts_no_delete BEFORE DELETE ON clinic_app.patient_alerts FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER patient_alerts_no_truncate BEFORE TRUNCATE ON clinic_app.patient_alerts FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION clinic_app.protect_patient_alert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(OLD)-ARRAY['version','body']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['version','body']) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Alert identity and versions are protected' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM clinic_app.patient_alert_versions v WHERE v.alert_id=NEW.id AND v.version=NEW.version AND v.body=NEW.body) THEN RAISE EXCEPTION 'Alert changes require an immutable matching revision'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER patient_alert_guard BEFORE UPDATE ON clinic_app.patient_alerts FOR EACH ROW EXECUTE FUNCTION clinic_app.protect_patient_alert();
