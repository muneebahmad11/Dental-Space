CREATE TABLE "clinic_app"."charges" (
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
	"description" text NOT NULL,
	CONSTRAINT "charges_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "charges_scope_unique" UNIQUE("clinic_id","branch_id","patient_id","id"),
	CONSTRAINT "charges_amount" CHECK ("clinic_app"."charges"."amount_minor" between 1 and 99999999),
	CONSTRAINT "charges_currency" CHECK ("clinic_app"."charges"."currency"='PKR'),
	CONSTRAINT "charges_description" CHECK (length(trim("clinic_app"."charges"."description")) between 2 and 240)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	CONSTRAINT "payment_charge_unique" UNIQUE("payment_id","charge_id"),
	CONSTRAINT "allocation_amount" CHECK ("clinic_app"."payment_allocations"."amount_minor">0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."payments" (
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
	"method" text NOT NULL,
	"paid_on" date NOT NULL,
	CONSTRAINT "payments_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "payments_scope_unique" UNIQUE("clinic_id","branch_id","patient_id","id"),
	CONSTRAINT "payments_amount" CHECK ("clinic_app"."payments"."amount_minor" between 1 and 99999999),
	CONSTRAINT "payments_currency" CHECK ("clinic_app"."payments"."currency"='PKR'),
	CONSTRAINT "payments_method" CHECK ("clinic_app"."payments"."method" in ('Cash','Card','Bank transfer'))
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"number" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_payment_unique" UNIQUE("payment_id"),
	CONSTRAINT "receipts_number_unique" UNIQUE("clinic_id","number")
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."charges" ADD CONSTRAINT "charges_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "clinic_app"."patients"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."charges" ADD CONSTRAINT "charges_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."charges" ADD CONSTRAINT "charges_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."payment_allocations" ADD CONSTRAINT "allocation_payment_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","payment_id") REFERENCES "clinic_app"."payments"("clinic_id","branch_id","patient_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."payment_allocations" ADD CONSTRAINT "allocation_charge_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","charge_id") REFERENCES "clinic_app"."charges"("clinic_id","branch_id","patient_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."payments" ADD CONSTRAINT "payments_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "clinic_app"."patients"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."payments" ADD CONSTRAINT "payments_branch_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."payments" ADD CONSTRAINT "payments_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."receipts" ADD CONSTRAINT "receipt_payment_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","payment_id") REFERENCES "clinic_app"."payments"("clinic_id","branch_id","patient_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charges_account_idx" ON "clinic_app"."charges" USING btree ("clinic_id","branch_id","patient_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_account_idx" ON "clinic_app"."payments" USING btree ("clinic_id","branch_id","patient_id");--> statement-breakpoint
CREATE INDEX "payments_day_idx" ON "clinic_app"."payments" USING btree ("clinic_id","branch_id","paid_on");
--> statement-breakpoint
INSERT INTO clinic_app.permissions(key,description) VALUES ('billing.read','Read scoped accounts and receipts'), ('charge.post','Post reviewed patient charges');
--> statement-breakpoint
GRANT SELECT, INSERT ON clinic_app.charges,clinic_app.payments,clinic_app.payment_allocations,clinic_app.receipts TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER charges_immutable BEFORE UPDATE OR DELETE ON clinic_app.charges FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER payments_immutable BEFORE UPDATE OR DELETE ON clinic_app.payments FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER allocations_immutable BEFORE UPDATE OR DELETE ON clinic_app.payment_allocations FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER receipts_immutable BEFORE UPDATE OR DELETE ON clinic_app.receipts FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER charges_no_truncate BEFORE TRUNCATE ON clinic_app.charges FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER payments_no_truncate BEFORE TRUNCATE ON clinic_app.payments FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER allocations_no_truncate BEFORE TRUNCATE ON clinic_app.payment_allocations FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER receipts_no_truncate BEFORE TRUNCATE ON clinic_app.receipts FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
