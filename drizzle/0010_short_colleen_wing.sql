CREATE TABLE "clinic_app"."closing_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"draft_id" uuid NOT NULL,
	"draft_version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closing_approved_day_unique" UNIQUE("clinic_id","branch_id","business_date")
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."closing_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"opening_minor" integer NOT NULL,
	"counted_minor" integer NOT NULL,
	"note" text NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closing_draft_day_unique" UNIQUE("clinic_id","branch_id","business_date"),
	CONSTRAINT "closing_draft_scope_unique" UNIQUE("clinic_id","branch_id","id"),
	CONSTRAINT "closing_draft_amounts" CHECK ("clinic_app"."closing_drafts"."opening_minor" between 0 and 99999999 and "clinic_app"."closing_drafts"."counted_minor" between 0 and 99999999 and "clinic_app"."closing_drafts"."version">0)
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."closing_approvals" ADD CONSTRAINT "closing_approval_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."closing_approvals" ADD CONSTRAINT "closing_approval_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."closing_approvals" ADD CONSTRAINT "closing_approval_draft_fk" FOREIGN KEY ("clinic_id","branch_id","draft_id") REFERENCES "clinic_app"."closing_drafts"("clinic_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."closing_drafts" ADD CONSTRAINT "closing_draft_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."closing_drafts" ADD CONSTRAINT "closing_draft_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO clinic_app.permissions(key,description) VALUES ('closing.read','Read branch daily closing totals'), ('closing.write','Prepare branch daily cash count');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON clinic_app.closing_drafts TO clinic_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON clinic_app.closing_approvals TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER closing_approvals_immutable BEFORE UPDATE OR DELETE ON clinic_app.closing_approvals FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER closing_approvals_no_truncate BEFORE TRUNCATE ON clinic_app.closing_approvals FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
