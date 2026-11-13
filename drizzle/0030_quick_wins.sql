CREATE TABLE "clinic_app"."clinic_logos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"mime_type" text NOT NULL,
	"data" text NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinic_logos_mime" CHECK ("clinic_app"."clinic_logos"."mime_type" in ('image/png','image/jpeg','image/webp')),
	CONSTRAINT "clinic_logos_size" CHECK (length("clinic_app"."clinic_logos"."data") between 100 and 300000)
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD COLUMN "message_templates" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD COLUMN "logo_id" uuid;--> statement-breakpoint
ALTER TABLE "clinic_app"."charges" ADD COLUMN "discount_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."charges" ADD COLUMN "discount_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."clinic_logos" ADD CONSTRAINT "clinic_logos_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "clinic_app"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clinic_logos_clinic_idx" ON "clinic_app"."clinic_logos" USING btree ("clinic_id");--> statement-breakpoint
ALTER TABLE "clinic_app"."charges" ADD CONSTRAINT "charges_discount_valid" CHECK ("clinic_app"."charges"."discount_minor">=0 and length("clinic_app"."charges"."discount_reason")<=200 and ("clinic_app"."charges"."discount_minor"=0)=("clinic_app"."charges"."discount_reason"=''));--> statement-breakpoint
INSERT INTO clinic_app.permissions (key,description) VALUES ('charge.discount','Give a discount on a charge with a recorded reason') ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Existing clinics: owners and dentists decide discounts. New clinics get this from the role templates in code.
INSERT INTO clinic_app.role_permissions(clinic_id, role_id, permission) SELECT clinic_id, id, 'charge.discount' FROM clinic_app.roles WHERE name IN ('owner','dentist') ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Column grants only: message wording and the current logo are owner settings.
GRANT UPDATE (message_templates, logo_id) ON clinic_app.clinics TO clinic_runtime;
--> statement-breakpoint
-- Logos are append-only: a new upload adds a row; old receipts keep pointing at theirs.
GRANT SELECT, INSERT ON clinic_app.clinic_logos TO clinic_runtime;
