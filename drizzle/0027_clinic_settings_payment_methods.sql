CREATE TABLE "clinic_app"."clinic_payment_methods" (
	"clinic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_cash" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "clinic_payment_methods_clinic_id_name_pk" PRIMARY KEY("clinic_id","name"),
	CONSTRAINT "clinic_payment_methods_name" CHECK ("clinic_app"."clinic_payment_methods"."name" = trim("clinic_app"."clinic_payment_methods"."name") and length("clinic_app"."clinic_payment_methods"."name") between 2 and 40)
);
--> statement-breakpoint
-- Every clinic, existing and future, starts with the methods a Pakistani clinic uses. Existing payments,
-- refunds and expenses only ever used Cash, Card or Bank transfer, so the new foreign keys hold.
CREATE FUNCTION clinic_app.seed_clinic_payment_methods() RETURNS trigger LANGUAGE plpgsql SET search_path = clinic_app, pg_temp AS $$
BEGIN
  INSERT INTO clinic_app.clinic_payment_methods(clinic_id, name, is_cash, sort_order)
    VALUES (NEW.id, 'Cash', true, 1), (NEW.id, 'Card', false, 2), (NEW.id, 'Bank transfer', false, 3), (NEW.id, 'Easypaisa', false, 4), (NEW.id, 'JazzCash', false, 5);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER clinics_seed_payment_methods AFTER INSERT ON clinic_app.clinics FOR EACH ROW EXECUTE FUNCTION clinic_app.seed_clinic_payment_methods();
--> statement-breakpoint
INSERT INTO clinic_app.clinic_payment_methods(clinic_id, name, is_cash, sort_order)
  SELECT c.id, m.name, m.is_cash, m.sort_order FROM clinic_app.clinics c
  CROSS JOIN (VALUES ('Cash', true, 1), ('Card', false, 2), ('Bank transfer', false, 3), ('Easypaisa', false, 4), ('JazzCash', false, 5)) AS m(name, is_cash, sort_order);
--> statement-breakpoint
ALTER TABLE "clinic_app"."expenses" DROP CONSTRAINT "expenses_method_valid";--> statement-breakpoint
ALTER TABLE "clinic_app"."payments" DROP CONSTRAINT "payments_method";--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD COLUMN "receipt_header" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD COLUMN "receipt_footer" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD COLUMN "ntn" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD COLUMN "closing_approval_policy" text DEFAULT 'second_approver' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD COLUMN "settings_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."clinic_payment_methods" ADD CONSTRAINT "clinic_payment_methods_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "clinic_app"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."expenses" ADD CONSTRAINT "expenses_method_fk" FOREIGN KEY ("clinic_id","method") REFERENCES "clinic_app"."clinic_payment_methods"("clinic_id","name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."payment_refunds" ADD CONSTRAINT "refund_method_fk" FOREIGN KEY ("clinic_id","method") REFERENCES "clinic_app"."clinic_payment_methods"("clinic_id","name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."payments" ADD CONSTRAINT "payments_method_fk" FOREIGN KEY ("clinic_id","method") REFERENCES "clinic_app"."clinic_payment_methods"("clinic_id","name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD CONSTRAINT "clinics_closing_policy_valid" CHECK ("clinic_app"."clinics"."closing_approval_policy" in ('second_approver','owner_self_with_note'));--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD CONSTRAINT "clinics_settings_lengths" CHECK (length("clinic_app"."clinics"."address") <= 300 and length("clinic_app"."clinics"."receipt_header") <= 200 and length("clinic_app"."clinics"."receipt_footer") <= 300 and length("clinic_app"."clinics"."ntn") <= 30 and length("clinic_app"."clinics"."phone") <= 30 and length("clinic_app"."clinics"."city") <= 80 and "clinic_app"."clinics"."settings_version" > 0);--> statement-breakpoint
INSERT INTO clinic_app.permissions (key,description) VALUES ('clinic.configure','Edit clinic details, receipt text, closing approval policy and payment methods') ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO clinic_app.role_permissions(clinic_id, role_id, permission) SELECT clinic_id, id, 'clinic.configure' FROM clinic_app.roles WHERE name = 'owner' ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Column grants only: the runtime role still cannot change a clinic's subscription status, plan or currency.
GRANT UPDATE (name, city, phone, address, receipt_header, receipt_footer, ntn, closing_approval_policy, settings_version) ON clinic_app.clinics TO clinic_runtime;
--> statement-breakpoint
GRANT SELECT ON clinic_app.clinic_payment_methods TO clinic_runtime;
--> statement-breakpoint
GRANT UPDATE (active) ON clinic_app.clinic_payment_methods TO clinic_runtime;
