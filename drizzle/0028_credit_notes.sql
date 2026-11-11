CREATE TABLE "clinic_app"."credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"charge_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"replacement_charge_id" uuid,
	CONSTRAINT "credit_notes_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "credit_note_amount" CHECK ("clinic_app"."credit_notes"."amount_minor" between 1 and 99999999),
	CONSTRAINT "credit_note_currency" CHECK ("clinic_app"."credit_notes"."currency"='PKR'),
	CONSTRAINT "credit_note_reason" CHECK (length(trim("clinic_app"."credit_notes"."reason")) between 3 and 500),
	CONSTRAINT "credit_note_replacement_differs" CHECK ("clinic_app"."credit_notes"."replacement_charge_id" is null or "clinic_app"."credit_notes"."replacement_charge_id"<>"clinic_app"."credit_notes"."charge_id")
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."credit_notes" ADD CONSTRAINT "credit_note_charge_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","charge_id") REFERENCES "clinic_app"."charges"("clinic_id","branch_id","patient_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."credit_notes" ADD CONSTRAINT "credit_note_replacement_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","replacement_charge_id") REFERENCES "clinic_app"."charges"("clinic_id","branch_id","patient_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."credit_notes" ADD CONSTRAINT "credit_note_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_notes_charge_idx" ON "clinic_app"."credit_notes" USING btree ("clinic_id","charge_id");--> statement-breakpoint
CREATE INDEX "credit_notes_account_idx" ON "clinic_app"."credit_notes" USING btree ("clinic_id","branch_id","patient_id","created_at");--> statement-breakpoint
GRANT SELECT, INSERT ON clinic_app.credit_notes TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER credit_notes_immutable BEFORE UPDATE OR DELETE ON clinic_app.credit_notes FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER credit_notes_no_truncate BEFORE TRUNCATE ON clinic_app.credit_notes FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
INSERT INTO clinic_app.permissions (key,description) VALUES ('charge.credit','Reduce or correct a posted charge with a credit note and a recorded reason') ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO clinic_app.role_permissions(clinic_id, role_id, permission) SELECT clinic_id, id, 'charge.credit' FROM clinic_app.roles WHERE name = 'owner' ON CONFLICT DO NOTHING;
