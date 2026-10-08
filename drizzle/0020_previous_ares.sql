CREATE TABLE "clinic_app"."patient_duplicate_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"candidate_patient_ids" jsonb NOT NULL,
	"more_candidates" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duplicate_review_patient_unique" UNIQUE("patient_id"),
	CONSTRAINT "duplicate_review_reason" CHECK (length(trim("clinic_app"."patient_duplicate_reviews"."reason")) between 3 and 500)
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_duplicate_reviews" ADD CONSTRAINT "duplicate_review_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "clinic_app"."patients"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_duplicate_reviews" ADD CONSTRAINT "duplicate_review_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."patient_duplicate_reviews" ADD CONSTRAINT "duplicate_review_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO clinic_app.permissions (key,description) VALUES ('patient.duplicate.override','Create a separate patient despite possible duplicate matches') ON CONFLICT DO NOTHING;
--> statement-breakpoint
GRANT SELECT,INSERT ON clinic_app.patient_duplicate_reviews TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER duplicate_reviews_immutable BEFORE UPDATE OR DELETE ON clinic_app.patient_duplicate_reviews FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER duplicate_reviews_no_truncate BEFORE TRUNCATE ON clinic_app.patient_duplicate_reviews FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
