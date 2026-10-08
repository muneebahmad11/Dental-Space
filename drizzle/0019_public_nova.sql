CREATE TABLE "clinic_app"."patient_profile_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"body" jsonb NOT NULL,
	"reason" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_history_version_unique" UNIQUE("clinic_id","patient_id","version"),
	CONSTRAINT "profile_history_operation_unique" UNIQUE("clinic_id","operation_id"),
	CONSTRAINT "profile_history_version" CHECK ("clinic_app"."patient_profile_versions"."version">0),
	CONSTRAINT "profile_history_reason" CHECK (length(trim("clinic_app"."patient_profile_versions"."reason")) between 3 and 500)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."patient_profiles" (
	"patient_id" uuid PRIMARY KEY NOT NULL,
	"clinic_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "profile_version" CHECK ("clinic_app"."patient_profiles"."version">0)
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_profile_versions" ADD CONSTRAINT "profile_version_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "clinic_app"."patients"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_profile_versions" ADD CONSTRAINT "profile_version_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_profile_versions" ADD CONSTRAINT "profile_version_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_profiles" ADD CONSTRAINT "profile_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "clinic_app"."patients"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO clinic_app.permissions (key,description) VALUES ('patient.archive','Archive and restore patient master profiles') ON CONFLICT DO NOTHING;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON clinic_app.patient_profiles TO clinic_runtime;
--> statement-breakpoint
GRANT SELECT,INSERT ON clinic_app.patient_profile_versions TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER profile_versions_immutable BEFORE UPDATE OR DELETE ON clinic_app.patient_profile_versions FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER profile_versions_no_truncate BEFORE TRUNCATE ON clinic_app.patient_profile_versions FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER profiles_no_delete BEFORE DELETE ON clinic_app.patient_profiles FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER profiles_no_truncate BEFORE TRUNCATE ON clinic_app.patient_profiles FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION clinic_app.protect_patient_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND ((OLD.clinic_id,OLD.patient_id) IS DISTINCT FROM (NEW.clinic_id,NEW.patient_id) OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'Patient profile identity/version is protected' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM clinic_app.patient_profile_versions v WHERE v.clinic_id=NEW.clinic_id AND v.patient_id=NEW.patient_id AND v.version=NEW.version AND v.body=NEW.body) THEN RAISE EXCEPTION 'Patient profile needs a matching immutable revision'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER profile_guard BEFORE INSERT OR UPDATE ON clinic_app.patient_profiles FOR EACH ROW EXECUTE FUNCTION clinic_app.protect_patient_profile();
