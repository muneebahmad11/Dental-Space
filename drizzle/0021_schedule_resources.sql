CREATE TABLE "clinic_app"."branch_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"closed_on" date NOT NULL,
	"reason" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_closure_scope_unique" UNIQUE("clinic_id","branch_id","id"),
	CONSTRAINT "branch_closure_reason" CHECK (length(trim("clinic_app"."branch_closures"."reason")) between 3 and 200),
	CONSTRAINT "branch_closure_version" CHECK ("clinic_app"."branch_closures"."version">0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."branch_schedule_settings" (
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"slot_minutes" integer NOT NULL,
	"weekly_hours" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_schedule_settings_clinic_id_branch_id_pk" PRIMARY KEY("clinic_id","branch_id"),
	CONSTRAINT "schedule_settings_slot" CHECK ("clinic_app"."branch_schedule_settings"."slot_minutes" in (5,10,15,20,30,60)),
	CONSTRAINT "schedule_settings_version" CHECK ("clinic_app"."branch_schedule_settings"."version">0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."schedule_chairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_chair_scope_unique" UNIQUE("clinic_id","branch_id","id"),
	CONSTRAINT "schedule_chair_name" CHECK (length(trim("clinic_app"."schedule_chairs"."name")) between 2 and 80),
	CONSTRAINT "schedule_chair_version" CHECK ("clinic_app"."schedule_chairs"."version">0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."schedule_config_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_revision_version_unique" UNIQUE("entity_type","entity_id","version"),
	CONSTRAINT "schedule_revision_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "schedule_revision_type" CHECK ("clinic_app"."schedule_config_revisions"."entity_type" in ('dentist','chair','hours','closure')),
	CONSTRAINT "schedule_revision_version" CHECK ("clinic_app"."schedule_config_revisions"."version">0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."schedule_dentists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"membership_id" uuid,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_dentist_scope_unique" UNIQUE("clinic_id","branch_id","id"),
	CONSTRAINT "schedule_dentist_membership_unique" UNIQUE("clinic_id","branch_id","membership_id"),
	CONSTRAINT "schedule_dentist_name" CHECK (length(trim("clinic_app"."schedule_dentists"."name")) between 2 and 80),
	CONSTRAINT "schedule_dentist_color" CHECK ("clinic_app"."schedule_dentists"."color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "schedule_dentist_version" CHECK ("clinic_app"."schedule_dentists"."version">0)
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."branch_closures" ADD CONSTRAINT "branch_closure_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."branch_schedule_settings" ADD CONSTRAINT "schedule_settings_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."schedule_chairs" ADD CONSTRAINT "schedule_chair_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."schedule_config_revisions" ADD CONSTRAINT "schedule_revision_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."schedule_config_revisions" ADD CONSTRAINT "schedule_revision_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."schedule_dentists" ADD CONSTRAINT "schedule_dentist_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."schedule_dentists" ADD CONSTRAINT "schedule_dentist_membership_fk" FOREIGN KEY ("clinic_id","membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branch_closure_active_date_unique" ON "clinic_app"."branch_closures" USING btree ("clinic_id","branch_id","closed_on") WHERE "clinic_app"."branch_closures"."active";--> statement-breakpoint
CREATE INDEX "branch_closure_date_idx" ON "clinic_app"."branch_closures" USING btree ("clinic_id","branch_id","closed_on");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_chair_name_unique" ON "clinic_app"."schedule_chairs" USING btree ("clinic_id","branch_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_dentist_name_unique" ON "clinic_app"."schedule_dentists" USING btree ("clinic_id","branch_id",lower("name"));--> statement-breakpoint
INSERT INTO clinic_app.permissions (key,description) VALUES ('schedule.configure','Configure branch dentists, chairs, opening hours and closed dates') ON CONFLICT DO NOTHING;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON clinic_app.schedule_dentists,clinic_app.schedule_chairs,clinic_app.branch_schedule_settings,clinic_app.branch_closures TO clinic_runtime;
--> statement-breakpoint
GRANT SELECT,INSERT ON clinic_app.schedule_config_revisions TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER schedule_revisions_immutable BEFORE UPDATE OR DELETE ON clinic_app.schedule_config_revisions FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER schedule_revisions_no_truncate BEFORE TRUNCATE ON clinic_app.schedule_config_revisions FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
