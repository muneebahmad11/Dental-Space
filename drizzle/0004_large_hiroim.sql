ALTER TABLE "clinic_app"."patients" ADD COLUMN "creation_key" uuid;
--> statement-breakpoint
ALTER TABLE "clinic_app"."patients" ADD COLUMN "creation_hash" text;
--> statement-breakpoint
-- Existing registrations predate retry keys and cannot be replayed through this protocol.
UPDATE "clinic_app"."patients" SET "creation_key" = id, "creation_hash" = 'legacy:' || id::text;
--> statement-breakpoint
ALTER TABLE "clinic_app"."patients" ALTER COLUMN "creation_key" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "clinic_app"."patients" ALTER COLUMN "creation_hash" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "clinic_app"."patients" ADD CONSTRAINT "patients_clinic_creation_key_unique" UNIQUE("clinic_id","creation_key");
