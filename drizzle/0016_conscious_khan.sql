CREATE TABLE "clinic_app"."treatment_charge_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"completion_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "completion_charge_once" UNIQUE("completion_id"),
	CONSTRAINT "charge_completion_once" UNIQUE("charge_id"),
	CONSTRAINT "treatment_charge_operation_unique" UNIQUE("clinic_id","branch_id","operation_id")
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."treatment_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"performed_on" date NOT NULL,
	"note" text NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "completion_scope_unique" UNIQUE("clinic_id","branch_id","patient_id","id"),
	CONSTRAINT "completion_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "completion_quantity" CHECK ("clinic_app"."treatment_completions"."quantity" between 1 and 100),
	CONSTRAINT "completion_note" CHECK (length(trim("clinic_app"."treatment_completions"."note")) between 3 and 1000)
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."plan_acceptances" ADD CONSTRAINT "plan_acceptance_version_scope" UNIQUE("clinic_id","branch_id","plan_id","version");--> statement-breakpoint
ALTER TABLE "clinic_app"."treatment_plans" ADD CONSTRAINT "plans_patient_scope_unique" UNIQUE("clinic_id","branch_id","patient_id","id");--> statement-breakpoint
ALTER TABLE "clinic_app"."treatment_charge_links" ADD CONSTRAINT "treatment_charge_completion_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","completion_id") REFERENCES "clinic_app"."treatment_completions"("clinic_id","branch_id","patient_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."treatment_charge_links" ADD CONSTRAINT "treatment_charge_charge_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","charge_id") REFERENCES "clinic_app"."charges"("clinic_id","branch_id","patient_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."treatment_charge_links" ADD CONSTRAINT "treatment_charge_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."treatment_completions" ADD CONSTRAINT "completion_patient_plan_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","plan_id") REFERENCES "clinic_app"."treatment_plans"("clinic_id","branch_id","patient_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."treatment_completions" ADD CONSTRAINT "completion_accepted_fk" FOREIGN KEY ("clinic_id","branch_id","plan_id","version") REFERENCES "clinic_app"."plan_acceptances"("clinic_id","branch_id","plan_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."treatment_completions" ADD CONSTRAINT "completion_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO clinic_app.permissions (key,description) VALUES ('plan.complete','Record completed treatment quantities') ON CONFLICT DO NOTHING;
--> statement-breakpoint
GRANT SELECT,INSERT ON clinic_app.treatment_completions,clinic_app.treatment_charge_links TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER completions_immutable BEFORE UPDATE OR DELETE ON clinic_app.treatment_completions FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER completions_no_truncate BEFORE TRUNCATE ON clinic_app.treatment_completions FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER treatment_links_immutable BEFORE UPDATE OR DELETE ON clinic_app.treatment_charge_links FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER treatment_links_no_truncate BEFORE TRUNCATE ON clinic_app.treatment_charge_links FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION clinic_app.check_completion_quantity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p clinic_app.treatment_plans; item jsonb; completed integer;
BEGIN
 SELECT * INTO p FROM clinic_app.treatment_plans WHERE id=NEW.plan_id FOR UPDATE;
 IF p.status IS DISTINCT FROM 'accepted' OR p.version<>NEW.version THEN RAISE EXCEPTION 'Treatment requires the accepted estimate'; END IF;
 SELECT element INTO item FROM clinic_app.plan_versions v, jsonb_array_elements(v.snapshot->'items') element WHERE v.plan_id=NEW.plan_id AND v.version=NEW.version AND element->>'id'=NEW.item_id::text;
 IF item IS NULL THEN RAISE EXCEPTION 'Treatment item is missing'; END IF;
 SELECT coalesce(sum(quantity),0) INTO completed FROM clinic_app.treatment_completions WHERE plan_id=NEW.plan_id AND item_id=NEW.item_id;
 IF completed+NEW.quantity>(item->>'quantity')::integer THEN RAISE EXCEPTION 'Treatment quantity exceeds the accepted estimate'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER completion_quantity_guard BEFORE INSERT ON clinic_app.treatment_completions FOR EACH ROW EXECUTE FUNCTION clinic_app.check_completion_quantity();
--> statement-breakpoint
CREATE FUNCTION clinic_app.check_treatment_charge() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE completion clinic_app.treatment_completions; item jsonb; amount integer;
BEGIN
 SELECT * INTO completion FROM clinic_app.treatment_completions WHERE id=NEW.completion_id;
 SELECT element INTO item FROM clinic_app.plan_versions v, jsonb_array_elements(v.snapshot->'items') element WHERE v.plan_id=completion.plan_id AND v.version=completion.version AND element->>'id'=completion.item_id::text;
 SELECT amount_minor INTO amount FROM clinic_app.charges WHERE id=NEW.charge_id;
 IF item IS NULL OR amount IS DISTINCT FROM ((item->>'unitPriceMinor')::bigint*completion.quantity) THEN RAISE EXCEPTION 'Charge must match the accepted treatment price'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER treatment_charge_price_guard BEFORE INSERT ON clinic_app.treatment_charge_links FOR EACH ROW EXECUTE FUNCTION clinic_app.check_treatment_charge();
