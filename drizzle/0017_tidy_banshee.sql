CREATE TABLE "clinic_app"."follow_up_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"follow_up_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"detail" jsonb NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_up_event_version_unique" UNIQUE("follow_up_id","version"),
	CONSTRAINT "follow_up_event_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "follow_up_event_kind" CHECK ("clinic_app"."follow_up_events"."kind" in ('created','edited','transition','contact','booked')),
	CONSTRAINT "follow_up_event_version" CHECK ("clinic_app"."follow_up_events"."version">0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"visit_id" uuid,
	"type" text NOT NULL,
	"custom_type" text NOT NULL,
	"due_on" date NOT NULL,
	"assignee_id" uuid,
	"status" text DEFAULT 'due' NOT NULL,
	"appointment_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_up_scope_unique" UNIQUE("clinic_id","branch_id","id"),
	CONSTRAINT "follow_up_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "follow_up_status" CHECK ("clinic_app"."follow_ups"."status" in ('due','contacted','booked','completed','closed','unable_to_reach')),
	CONSTRAINT "follow_up_version" CHECK ("clinic_app"."follow_ups"."version">0),
	CONSTRAINT "follow_up_booked_link" CHECK ("clinic_app"."follow_ups"."status"<>'booked' or "clinic_app"."follow_ups"."appointment_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."follow_up_events" ADD CONSTRAINT "follow_up_event_parent_fk" FOREIGN KEY ("clinic_id","branch_id","follow_up_id") REFERENCES "clinic_app"."follow_ups"("clinic_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."follow_up_events" ADD CONSTRAINT "follow_up_event_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."follow_ups" ADD CONSTRAINT "follow_up_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "clinic_app"."patients"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."follow_ups" ADD CONSTRAINT "follow_up_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."follow_ups" ADD CONSTRAINT "follow_up_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."follow_ups" ADD CONSTRAINT "follow_up_assignee_fk" FOREIGN KEY ("clinic_id","assignee_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."follow_ups" ADD CONSTRAINT "follow_up_visit_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","visit_id") REFERENCES "clinic_app"."visits"("clinic_id","branch_id","patient_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."follow_ups" ADD CONSTRAINT "follow_up_appointment_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","appointment_id") REFERENCES "clinic_app"."appointments"("clinic_id","branch_id","patient_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follow_up_due_idx" ON "clinic_app"."follow_ups" USING btree ("clinic_id","branch_id","status","due_on");--> statement-breakpoint
INSERT INTO clinic_app.permissions (key,description) VALUES ('followup.read','Read follow-up and recall records'),('followup.write','Create and update follow-ups and recalls') ON CONFLICT DO NOTHING;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON clinic_app.follow_ups TO clinic_runtime;
--> statement-breakpoint
GRANT SELECT,INSERT ON clinic_app.follow_up_events TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER follow_up_events_immutable BEFORE UPDATE OR DELETE ON clinic_app.follow_up_events FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER follow_up_events_no_truncate BEFORE TRUNCATE ON clinic_app.follow_up_events FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER follow_ups_no_delete BEFORE DELETE ON clinic_app.follow_ups FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER follow_ups_no_truncate BEFORE TRUNCATE ON clinic_app.follow_ups FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION clinic_app.protect_follow_up() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(OLD)-ARRAY['due_on','assignee_id','status','appointment_id','version']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['due_on','assignee_id','status','appointment_id','version']) OR OLD.status IN ('completed','closed') THEN
  RAISE EXCEPTION 'Follow-up identity and finished records are immutable' USING ERRCODE='42501';
 END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Follow-up version must advance once'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER follow_up_identity_guard BEFORE UPDATE ON clinic_app.follow_ups FOR EACH ROW EXECUTE FUNCTION clinic_app.protect_follow_up();
--> statement-breakpoint
CREATE FUNCTION clinic_app.check_follow_up_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p clinic_app.follow_ups;
BEGIN
 SELECT * INTO p FROM clinic_app.follow_ups WHERE id=NEW.follow_up_id;
 IF p.version IS DISTINCT FROM NEW.version OR length(trim(NEW.detail->>'note')) NOT BETWEEN 3 AND 1000 OR NEW.detail->>'note' IS NULL THEN RAISE EXCEPTION 'Follow-up history must match the current version and include a note'; END IF;
 IF NEW.detail ? 'status' AND NEW.detail->>'status' IS DISTINCT FROM p.status THEN RAISE EXCEPTION 'Follow-up status event mismatch'; END IF;
 IF NEW.detail ? 'dueOn' AND NEW.detail->>'dueOn' IS DISTINCT FROM p.due_on::text THEN RAISE EXCEPTION 'Follow-up due date event mismatch'; END IF;
 IF NEW.detail ? 'assigneeId' AND NEW.detail->>'assigneeId' IS DISTINCT FROM p.assignee_id::text THEN RAISE EXCEPTION 'Follow-up assignment event mismatch'; END IF;
 IF NEW.detail ? 'appointmentId' AND NEW.detail->>'appointmentId' IS DISTINCT FROM p.appointment_id::text THEN RAISE EXCEPTION 'Follow-up appointment event mismatch'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER follow_up_event_guard BEFORE INSERT ON clinic_app.follow_up_events FOR EACH ROW EXECUTE FUNCTION clinic_app.check_follow_up_event();
