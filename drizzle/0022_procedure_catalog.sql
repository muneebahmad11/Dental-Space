CREATE TABLE "clinic_app"."procedure_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"procedure_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procedure_version_unique" UNIQUE("procedure_id","version"),
	CONSTRAINT "procedure_version_operation_unique" UNIQUE("clinic_id","operation_id"),
	CONSTRAINT "procedure_version_positive" CHECK ("clinic_app"."procedure_versions"."version">0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."procedures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"default_minutes" integer NOT NULL,
	"price_minor" integer,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procedure_scope_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "procedure_name" CHECK (length(trim("clinic_app"."procedures"."name")) between 2 and 120),
	CONSTRAINT "procedure_category" CHECK ("clinic_app"."procedures"."category" in ('Consultation','Diagnostic','Preventive','Restorative','Endodontic','Periodontal','Prosthodontic','Oral surgery','Orthodontic','Implant','Cosmetic','Pediatric','Other')),
	CONSTRAINT "procedure_minutes" CHECK ("clinic_app"."procedures"."default_minutes" between 5 and 480 and "clinic_app"."procedures"."default_minutes"%5=0),
	CONSTRAINT "procedure_price" CHECK ("clinic_app"."procedures"."price_minor" is null or "clinic_app"."procedures"."price_minor" between 1 and 99999999),
	CONSTRAINT "procedure_version" CHECK ("clinic_app"."procedures"."version">0)
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."procedure_versions" ADD CONSTRAINT "procedure_version_parent_fk" FOREIGN KEY ("clinic_id","procedure_id") REFERENCES "clinic_app"."procedures"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."procedure_versions" ADD CONSTRAINT "procedure_version_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."procedure_versions" ADD CONSTRAINT "procedure_version_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."procedures" ADD CONSTRAINT "procedures_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "clinic_app"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "procedure_name_unique" ON "clinic_app"."procedures" USING btree ("clinic_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "procedure_code_unique" ON "clinic_app"."procedures" USING btree ("clinic_id",lower("code")) WHERE "clinic_app"."procedures"."code"<>'';--> statement-breakpoint
INSERT INTO clinic_app.permissions (key,description) VALUES ('procedure.configure','Maintain the clinic procedure catalog, default durations and default prices') ON CONFLICT DO NOTHING;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON clinic_app.procedures TO clinic_runtime;
--> statement-breakpoint
GRANT SELECT,INSERT ON clinic_app.procedure_versions TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER procedure_versions_immutable BEFORE UPDATE OR DELETE ON clinic_app.procedure_versions FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER procedure_versions_no_truncate BEFORE TRUNCATE ON clinic_app.procedure_versions FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
