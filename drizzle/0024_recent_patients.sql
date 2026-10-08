CREATE TABLE "clinic_app"."recent_patients" (
	"clinic_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recent_patients_membership_id_patient_id_pk" PRIMARY KEY("membership_id","patient_id")
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."recent_patients" ADD CONSTRAINT "recent_patient_member_fk" FOREIGN KEY ("clinic_id","membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."recent_patients" ADD CONSTRAINT "recent_patient_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "clinic_app"."patients"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recent_patient_member_idx" ON "clinic_app"."recent_patients" USING btree ("membership_id","viewed_at");--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON clinic_app.recent_patients TO clinic_runtime;
