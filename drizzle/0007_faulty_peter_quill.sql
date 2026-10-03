CREATE TABLE "clinic_app"."communication_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"kind" text NOT NULL,
	"code" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communication_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."communication_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"recipient" text NOT NULL,
	"preference_version" integer NOT NULL,
	"template" text NOT NULL,
	"language" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"appointment_id" uuid,
	"appointment_version" integer,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" uuid,
	"provider_message_id" text,
	"delivery_status" text,
	"last_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communication_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "communication_scope_unique" UNIQUE("clinic_id","branch_id","id"),
	CONSTRAINT "communication_provider_unique" UNIQUE("provider_message_id"),
	CONSTRAINT "communication_state" CHECK ("clinic_app"."communication_jobs"."state" in ('queued','processing','sending','submitted','review','failed','cancelled')),
	CONSTRAINT "communication_attempts" CHECK ("clinic_app"."communication_jobs"."attempts" between 0 and 5),
	CONSTRAINT "communication_recipient" CHECK ("clinic_app"."communication_jobs"."recipient" ~ '^[1-9][0-9]{7,14}$'),
	CONSTRAINT "communication_delivery" CHECK ("clinic_app"."communication_jobs"."delivery_status" is null or "clinic_app"."communication_jobs"."delivery_status" in ('sent','delivered','read','failed')),
	CONSTRAINT "communication_appointment_pair" CHECK (("clinic_app"."communication_jobs"."appointment_id" is null) = ("clinic_app"."communication_jobs"."appointment_version" is null))
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."messaging_preferences" (
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"enabled" boolean NOT NULL,
	"recipient" text NOT NULL,
	"evidence" text NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_preferences_clinic_id_patient_id_pk" PRIMARY KEY("clinic_id","patient_id"),
	CONSTRAINT "preferences_version" CHECK ("clinic_app"."messaging_preferences"."version">0),
	CONSTRAINT "preferences_recipient" CHECK ("clinic_app"."messaging_preferences"."recipient" ~ '^[1-9][0-9]{7,14}$')
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."communication_events" ADD CONSTRAINT "communication_event_job_fk" FOREIGN KEY ("clinic_id","branch_id","job_id") REFERENCES "clinic_app"."communication_jobs"("clinic_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."communication_jobs" ADD CONSTRAINT "communication_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "clinic_app"."patients"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."communication_jobs" ADD CONSTRAINT "communication_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."communication_jobs" ADD CONSTRAINT "communication_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."messaging_preferences" ADD CONSTRAINT "preferences_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "clinic_app"."patients"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."messaging_preferences" ADD CONSTRAINT "preferences_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."messaging_preferences" ADD CONSTRAINT "preferences_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "communication_queue_idx" ON "clinic_app"."communication_jobs" USING btree ("clinic_id","state","available_at");--> statement-breakpoint
CREATE INDEX "communication_branch_idx" ON "clinic_app"."communication_jobs" USING btree ("clinic_id","branch_id","created_at");
--> statement-breakpoint
INSERT INTO clinic_app.permissions(key,description) VALUES
 ('communication.read','Read scoped communication history'),
 ('communication.send','Queue and cancel patient messages'),
 ('communication.preferences.write','Record patient messaging preferences');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON clinic_app.communication_jobs, clinic_app.messaging_preferences TO clinic_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON clinic_app.communication_events TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER communication_events_immutable BEFORE UPDATE OR DELETE ON clinic_app.communication_events
FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER communication_events_no_truncate BEFORE TRUNCATE ON clinic_app.communication_events
FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION clinic_app.protect_communication_payload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(OLD) - ARRAY['state','attempts','available_at','lease_until','lease_token','provider_message_id','delivery_status','last_code']) IS DISTINCT FROM
    (to_jsonb(NEW) - ARRAY['state','attempts','available_at','lease_until','lease_token','provider_message_id','delivery_status','last_code']) THEN
  RAISE EXCEPTION 'Queued message payload is immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER communication_payload_immutable BEFORE UPDATE ON clinic_app.communication_jobs
FOR EACH ROW EXECUTE FUNCTION clinic_app.protect_communication_payload();
--> statement-breakpoint
CREATE TRIGGER communication_jobs_no_delete BEFORE DELETE ON clinic_app.communication_jobs
FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER communication_jobs_no_truncate BEFORE TRUNCATE ON clinic_app.communication_jobs
FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
