CREATE SCHEMA "clinic_app";
--> statement-breakpoint
CREATE TABLE "clinic_app"."app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_users_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "app_users_name_nonempty" CHECK (length(trim("clinic_app"."app_users"."display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_clinic_id_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "branches_clinic_name_unique" UNIQUE("clinic_id","name"),
	CONSTRAINT "branches_name_nonempty" CHECK (length(trim("clinic_app"."branches"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."clinics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinics_name_nonempty" CHECK (length(trim("clinic_app"."clinics"."name")) > 0),
	CONSTRAINT "clinics_currency_format" CHECK ("clinic_app"."clinics"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "clinics_timezone_nonempty" CHECK (length(trim("clinic_app"."clinics"."timezone")) > 0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."membership_branches" (
	"clinic_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_branches_membership_id_branch_id_pk" PRIMARY KEY("membership_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_clinic_user_unique" UNIQUE("clinic_id","user_id"),
	CONSTRAINT "memberships_clinic_id_id_unique" UNIQUE("clinic_id","id")
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."branches" ADD CONSTRAINT "branches_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "clinic_app"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."membership_branches" ADD CONSTRAINT "membership_branches_membership_scope_fk" FOREIGN KEY ("clinic_id","membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."membership_branches" ADD CONSTRAINT "membership_branches_branch_scope_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."memberships" ADD CONSTRAINT "memberships_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "clinic_app"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."memberships" ADD CONSTRAINT "memberships_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "clinic_app"."app_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_branches_branch_idx" ON "clinic_app"."membership_branches" USING btree ("clinic_id","branch_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "clinic_app"."memberships" USING btree ("user_id");