CREATE TABLE "clinic_app"."visit_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"author_membership_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"body" jsonb NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_revision_unique" UNIQUE("visit_id","revision"),
	CONSTRAINT "visit_revision_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "revision_number" CHECK ("clinic_app"."visit_revisions"."revision">0),
	CONSTRAINT "revision_kind" CHECK ("clinic_app"."visit_revisions"."kind" in ('final','amendment')),
	CONSTRAINT "revision_reason" CHECK ("clinic_app"."visit_revisions"."kind"='final' or length(trim("clinic_app"."visit_revisions"."reason"))>=3)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"author_membership_id" uuid NOT NULL,
	"appointment_id" uuid,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visits_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "visits_appointment_unique" UNIQUE("clinic_id","branch_id","appointment_id"),
	CONSTRAINT "visits_scope_unique" UNIQUE("clinic_id","branch_id","patient_id","id"),
	CONSTRAINT "visit_status" CHECK ("clinic_app"."visits"."status" in ('draft','finalized')),
	CONSTRAINT "visit_version" CHECK ("clinic_app"."visits"."version">0)
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."visit_revisions" ADD CONSTRAINT "revision_visit_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","visit_id") REFERENCES "clinic_app"."visits"("clinic_id","branch_id","patient_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."visit_revisions" ADD CONSTRAINT "revision_author_fk" FOREIGN KEY ("clinic_id","author_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."visits" ADD CONSTRAINT "visit_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "clinic_app"."patients"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."visits" ADD CONSTRAINT "visit_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."visits" ADD CONSTRAINT "visit_author_fk" FOREIGN KEY ("clinic_id","author_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visits_patient_idx" ON "clinic_app"."visits" USING btree ("clinic_id","branch_id","patient_id","created_at");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON clinic_app.visits TO clinic_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON clinic_app.visit_revisions TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER visit_revisions_immutable BEFORE UPDATE OR DELETE ON clinic_app.visit_revisions FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER visit_revisions_no_truncate BEFORE TRUNCATE ON clinic_app.visit_revisions FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION clinic_app.protect_visit_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(OLD) - ARRAY['status','version','body','updated_at']) IS DISTINCT FROM
    (to_jsonb(NEW) - ARRAY['status','version','body','updated_at']) THEN
  RAISE EXCEPTION 'Visit identity and authorship are immutable' USING ERRCODE='42501';
 END IF;
 IF OLD.status='finalized' AND NEW.status<>'finalized' THEN
  RAISE EXCEPTION 'Signed visits cannot return to draft' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER visit_identity_immutable BEFORE UPDATE ON clinic_app.visits FOR EACH ROW EXECUTE FUNCTION clinic_app.protect_visit_identity();
--> statement-breakpoint
CREATE TRIGGER visits_no_delete BEFORE DELETE ON clinic_app.visits FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER visits_no_truncate BEFORE TRUNCATE ON clinic_app.visits FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
