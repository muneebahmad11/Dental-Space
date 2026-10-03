CREATE TABLE "clinic_app"."plan_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"accepted_by" text NOT NULL,
	"evidence" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_acceptance_once" UNIQUE("plan_id"),
	CONSTRAINT "plan_acceptance_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "plan_acceptance_evidence" CHECK (length(trim("clinic_app"."plan_acceptances"."evidence")) between 3 and 500),
	CONSTRAINT "plan_acceptance_name" CHECK (length(trim("clinic_app"."plan_acceptances"."accepted_by")) between 2 and 160)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_versions_scope_unique" UNIQUE("clinic_id","branch_id","plan_id","version"),
	CONSTRAINT "plan_versions_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "plan_revision_positive" CHECK ("clinic_app"."plan_versions"."version">0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."treatment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"author_membership_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_scope_unique" UNIQUE("clinic_id","branch_id","id"),
	CONSTRAINT "plans_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "plan_version" CHECK ("clinic_app"."treatment_plans"."version">0),
	CONSTRAINT "plan_status" CHECK ("clinic_app"."treatment_plans"."status" in ('draft','accepted'))
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."plan_acceptances" ADD CONSTRAINT "plan_acceptance_version_fk" FOREIGN KEY ("clinic_id","branch_id","plan_id","version") REFERENCES "clinic_app"."plan_versions"("clinic_id","branch_id","plan_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."plan_acceptances" ADD CONSTRAINT "plan_acceptance_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."plan_versions" ADD CONSTRAINT "plan_version_plan_fk" FOREIGN KEY ("clinic_id","branch_id","plan_id") REFERENCES "clinic_app"."treatment_plans"("clinic_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."plan_versions" ADD CONSTRAINT "plan_version_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."treatment_plans" ADD CONSTRAINT "plan_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "clinic_app"."patients"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."treatment_plans" ADD CONSTRAINT "plan_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."treatment_plans" ADD CONSTRAINT "plan_author_fk" FOREIGN KEY ("clinic_id","author_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_branch_idx" ON "clinic_app"."treatment_plans" USING btree ("clinic_id","branch_id","created_at");--> statement-breakpoint
INSERT INTO clinic_app.permissions (key,description) VALUES ('plan.read','Read treatment estimates'),('plan.write','Create and revise treatment estimates'),('plan.accept','Record patient acceptance of an estimate') ON CONFLICT DO NOTHING;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON clinic_app.treatment_plans TO clinic_runtime;
--> statement-breakpoint
GRANT SELECT,INSERT ON clinic_app.plan_versions,clinic_app.plan_acceptances TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER plan_versions_immutable BEFORE UPDATE OR DELETE ON clinic_app.plan_versions FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER plan_versions_no_truncate BEFORE TRUNCATE ON clinic_app.plan_versions FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER plan_acceptances_immutable BEFORE UPDATE OR DELETE ON clinic_app.plan_acceptances FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER plan_acceptances_no_truncate BEFORE TRUNCATE ON clinic_app.plan_acceptances FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER plans_no_delete BEFORE DELETE ON clinic_app.treatment_plans FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER plans_no_truncate BEFORE TRUNCATE ON clinic_app.treatment_plans FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION clinic_app.protect_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'draft' OR NEW.version<>1 THEN RAISE EXCEPTION 'New plans must start as version 1 drafts'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.status='accepted' OR (to_jsonb(OLD)-ARRAY['status','version']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','version']) THEN
  RAISE EXCEPTION 'Accepted plans and plan identity are immutable' USING ERRCODE='42501';
 END IF;
 IF NEW.status='accepted' THEN
  IF NEW.version<>OLD.version OR NOT EXISTS(SELECT 1 FROM clinic_app.plan_acceptances a WHERE a.plan_id=NEW.id AND a.version=NEW.version) THEN RAISE EXCEPTION 'Acceptance must match the current estimate'; END IF;
 ELSIF NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM clinic_app.plan_versions v WHERE v.plan_id=NEW.id AND v.version=NEW.version) THEN
  RAISE EXCEPTION 'Draft versions must advance to a saved estimate';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER plans_guard BEFORE INSERT OR UPDATE ON clinic_app.treatment_plans FOR EACH ROW EXECUTE FUNCTION clinic_app.protect_plan();
--> statement-breakpoint
CREATE FUNCTION clinic_app.protect_plan_record() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p clinic_app.treatment_plans;
BEGIN
 SELECT * INTO p FROM clinic_app.treatment_plans WHERE id=NEW.plan_id FOR UPDATE;
 IF p.status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Accepted plans cannot receive new records'; END IF;
 IF TG_TABLE_NAME='plan_acceptances' AND NEW.version<>p.version THEN RAISE EXCEPTION 'Only the current estimate can be accepted'; END IF;
 IF TG_TABLE_NAME='plan_versions' AND NEW.version NOT IN (p.version,p.version+1) THEN RAISE EXCEPTION 'Estimate version is out of sequence'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER plan_version_guard BEFORE INSERT ON clinic_app.plan_versions FOR EACH ROW EXECUTE FUNCTION clinic_app.protect_plan_record();
--> statement-breakpoint
CREATE TRIGGER plan_acceptance_guard BEFORE INSERT ON clinic_app.plan_acceptances FOR EACH ROW EXECUTE FUNCTION clinic_app.protect_plan_record();
