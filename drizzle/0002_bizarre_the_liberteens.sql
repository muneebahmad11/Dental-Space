CREATE TABLE "clinic_app"."audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_action_nonempty" CHECK (length(trim("clinic_app"."audit_events"."action")) > 0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."membership_grants" (
	"clinic_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "membership_grants_membership_id_permission_pk" PRIMARY KEY("membership_id","permission")
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."membership_roles" (
	"clinic_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "membership_roles_membership_id_role_id_pk" PRIMARY KEY("membership_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."role_permissions" (
	"clinic_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "roles_clinic_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "roles_clinic_name_unique" UNIQUE("clinic_id","name")
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"display_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"phone_normalized" text NOT NULL,
	"email" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patients_clinic_display_unique" UNIQUE("clinic_id","display_id"),
	CONSTRAINT "patients_clinic_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "patients_name_nonempty" CHECK (length(trim("clinic_app"."patients"."name")) >= 2),
	CONSTRAINT "patients_version_positive" CHECK ("clinic_app"."patients"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."audit_events" ADD CONSTRAINT "audit_events_clinic_id_branch_id_branches_clinic_id_id_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."audit_events" ADD CONSTRAINT "audit_events_clinic_id_actor_membership_id_memberships_clinic_id_id_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."membership_grants" ADD CONSTRAINT "membership_grants_permission_permissions_key_fk" FOREIGN KEY ("permission") REFERENCES "clinic_app"."permissions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."membership_grants" ADD CONSTRAINT "membership_grants_clinic_id_membership_id_memberships_clinic_id_id_fk" FOREIGN KEY ("clinic_id","membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."membership_roles" ADD CONSTRAINT "membership_roles_clinic_id_membership_id_memberships_clinic_id_id_fk" FOREIGN KEY ("clinic_id","membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."membership_roles" ADD CONSTRAINT "membership_roles_clinic_id_role_id_roles_clinic_id_id_fk" FOREIGN KEY ("clinic_id","role_id") REFERENCES "clinic_app"."roles"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."role_permissions" ADD CONSTRAINT "role_permissions_permission_permissions_key_fk" FOREIGN KEY ("permission") REFERENCES "clinic_app"."permissions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."role_permissions" ADD CONSTRAINT "role_permissions_clinic_id_role_id_roles_clinic_id_id_fk" FOREIGN KEY ("clinic_id","role_id") REFERENCES "clinic_app"."roles"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."roles" ADD CONSTRAINT "roles_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "clinic_app"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."patients" ADD CONSTRAINT "patients_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "clinic_app"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_scope_date_idx" ON "clinic_app"."audit_events" USING btree ("clinic_id","branch_id","occurred_at");--> statement-breakpoint
CREATE INDEX "patients_clinic_phone_idx" ON "clinic_app"."patients" USING btree ("clinic_id","phone_normalized");