CREATE TABLE "clinic_app"."appointment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"kind" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"detail" jsonb NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_event_version_unique" UNIQUE("appointment_id","version"),
	CONSTRAINT "appointment_event_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "appointment_event_kind" CHECK ("clinic_app"."appointment_events"."kind" in ('booked','walk_in','status','rescheduled','details')),
	CONSTRAINT "appointment_event_version" CHECK ("clinic_app"."appointment_events"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" DROP CONSTRAINT "appointments_status_valid";--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD COLUMN "dentist_id" uuid;--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD COLUMN "chair_id" uuid;--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD COLUMN "procedure_id" uuid;--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD COLUMN "reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD COLUMN "next_action" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD COLUMN "source" text DEFAULT 'phone' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD COLUMN "override_reason" text;--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD CONSTRAINT "appointments_scope_unique" UNIQUE("clinic_id","branch_id","id");--> statement-breakpoint
ALTER TABLE "clinic_app"."appointment_events" ADD CONSTRAINT "appointment_event_parent_fk" FOREIGN KEY ("clinic_id","branch_id","appointment_id") REFERENCES "clinic_app"."appointments"("clinic_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."appointment_events" ADD CONSTRAINT "appointment_event_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_event_parent_idx" ON "clinic_app"."appointment_events" USING btree ("clinic_id","branch_id","appointment_id","version");--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD CONSTRAINT "appointments_dentist_scope_fk" FOREIGN KEY ("clinic_id","branch_id","dentist_id") REFERENCES "clinic_app"."schedule_dentists"("clinic_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD CONSTRAINT "appointments_chair_scope_fk" FOREIGN KEY ("clinic_id","branch_id","chair_id") REFERENCES "clinic_app"."schedule_chairs"("clinic_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD CONSTRAINT "appointments_procedure_scope_fk" FOREIGN KEY ("clinic_id","procedure_id") REFERENCES "clinic_app"."procedures"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_dentist_time_idx" ON "clinic_app"."appointments" USING btree ("clinic_id","branch_id","dentist_id","starts_at");--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD CONSTRAINT "appointments_source_valid" CHECK ("clinic_app"."appointments"."source" in ('phone','in_person','walk_in','follow_up','online','other'));--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD CONSTRAINT "appointments_text_lengths" CHECK (length("clinic_app"."appointments"."reason") <= 240 and length("clinic_app"."appointments"."notes") <= 1000 and length("clinic_app"."appointments"."next_action") <= 240 and ("clinic_app"."appointments"."override_reason" is null or length(trim("clinic_app"."appointments"."override_reason")) between 3 and 300));--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD CONSTRAINT "appointments_status_valid" CHECK ("clinic_app"."appointments"."status" in ('booked','confirmed','arrived','waiting','in_treatment','completed','cancelled','no_show'));--> statement-breakpoint
UPDATE clinic_app.appointments SET source='other';
--> statement-breakpoint
-- Backfill lifecycle history for existing bookings from their append-only audit events.
INSERT INTO clinic_app.appointment_events (clinic_id,branch_id,appointment_id,version,kind,from_status,to_status,detail,actor_membership_id,operation_id,payload_hash,created_at)
SELECT a.clinic_id,a.branch_id,a.id,1,'booked',NULL,'booked',jsonb_build_object('startsAt',to_char(a.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'endsAt',to_char(a.ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'source','other'),e.actor_membership_id,a.operation_id,'migrated',e.occurred_at
FROM clinic_app.appointments a JOIN LATERAL (SELECT actor_membership_id,occurred_at FROM clinic_app.audit_events x WHERE x.clinic_id=a.clinic_id AND x.branch_id=a.branch_id AND x.entity_id=a.id AND x.action='appointment.booked' ORDER BY occurred_at LIMIT 1) e ON true;
--> statement-breakpoint
INSERT INTO clinic_app.appointment_events (clinic_id,branch_id,appointment_id,version,kind,from_status,to_status,detail,actor_membership_id,operation_id,payload_hash,created_at)
SELECT a.clinic_id,a.branch_id,a.id,2,'status','booked',a.status,'{}'::jsonb,e.actor_membership_id,gen_random_uuid(),'migrated',e.occurred_at
FROM clinic_app.appointments a JOIN LATERAL (SELECT actor_membership_id,occurred_at FROM clinic_app.audit_events x WHERE x.clinic_id=a.clinic_id AND x.branch_id=a.branch_id AND x.entity_id=a.id AND x.action IN ('appointment.arrived','appointment.cancelled') ORDER BY occurred_at LIMIT 1) e ON true
WHERE a.status IN ('arrived','cancelled') AND a.version=2;
--> statement-breakpoint
INSERT INTO clinic_app.permissions (key,description) VALUES ('appointment.override','Book over a dentist, chair or patient conflict, or outside opening hours, with a recorded reason'),('appointment.duration.override','Book a different duration from the procedure default') ON CONFLICT DO NOTHING;
--> statement-breakpoint
GRANT SELECT,INSERT ON clinic_app.appointment_events TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER appointment_events_immutable BEFORE UPDATE OR DELETE ON clinic_app.appointment_events FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER appointment_events_no_truncate BEFORE TRUNCATE ON clinic_app.appointment_events FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
