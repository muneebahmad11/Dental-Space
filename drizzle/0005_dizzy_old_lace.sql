CREATE TABLE "clinic_app"."appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'booked' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "appointments_time_order" CHECK ("clinic_app"."appointments"."ends_at" > "clinic_app"."appointments"."starts_at" and "clinic_app"."appointments"."ends_at" <= "clinic_app"."appointments"."starts_at" + interval '8 hours'),
	CONSTRAINT "appointments_status_valid" CHECK ("clinic_app"."appointments"."status" in ('booked','arrived','cancelled')),
	CONSTRAINT "appointments_version_positive" CHECK ("clinic_app"."appointments"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD CONSTRAINT "appointments_branch_scope_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."appointments" ADD CONSTRAINT "appointments_patient_scope_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "clinic_app"."patients"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_branch_time_idx" ON "clinic_app"."appointments" USING btree ("clinic_id","branch_id","starts_at");
--> statement-breakpoint
INSERT INTO clinic_app.permissions(key,description) VALUES ('appointment.read','Read branch appointments'),('appointment.write','Book and change branch appointments');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON clinic_app.appointments TO clinic_runtime;
