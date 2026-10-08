CREATE TABLE "clinic_app"."patient_contact_preference_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"body" jsonb NOT NULL,
	"reason" text NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_preference_version_unique" UNIQUE("clinic_id","patient_id","version"),
	CONSTRAINT "contact_preference_operation_unique" UNIQUE("clinic_id","operation_id"),
	CONSTRAINT "contact_preference_reason" CHECK (length(trim("clinic_app"."patient_contact_preference_versions"."reason")) between 3 and 300),
	CONSTRAINT "contact_preference_version_positive" CHECK ("clinic_app"."patient_contact_preference_versions"."version">0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."patient_contact_preferences" (
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"body" jsonb NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_contact_preferences_clinic_id_patient_id_pk" PRIMARY KEY("clinic_id","patient_id"),
	CONSTRAINT "contact_preference_version" CHECK ("clinic_app"."patient_contact_preferences"."version">0)
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_contact_preference_versions" ADD CONSTRAINT "contact_preference_version_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "clinic_app"."patients"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_contact_preference_versions" ADD CONSTRAINT "contact_preference_version_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_contact_preference_versions" ADD CONSTRAINT "contact_preference_version_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_contact_preferences" ADD CONSTRAINT "contact_preference_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "clinic_app"."patients"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON clinic_app.patient_contact_preferences TO clinic_runtime;
--> statement-breakpoint
GRANT SELECT,INSERT ON clinic_app.patient_contact_preference_versions TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER contact_preference_versions_immutable BEFORE UPDATE OR DELETE ON clinic_app.patient_contact_preference_versions FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER contact_preference_versions_no_truncate BEFORE TRUNCATE ON clinic_app.patient_contact_preference_versions FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
