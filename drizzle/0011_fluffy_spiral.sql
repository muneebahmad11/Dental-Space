CREATE TABLE "clinic_app"."allocation_reversals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"allocation_id" uuid NOT NULL,
	"refund_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	CONSTRAINT "refund_allocation_unique" UNIQUE("refund_id","allocation_id"),
	CONSTRAINT "reversal_positive" CHECK ("clinic_app"."allocation_reversals"."amount_minor">0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."payment_refunds" (
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
	"payment_id" uuid NOT NULL,
	"method" text NOT NULL,
	"paid_on" date NOT NULL,
	"reason" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "refunds_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "refunds_scope_unique" UNIQUE("clinic_id","branch_id","patient_id","payment_id","id"),
	CONSTRAINT "refund_amount" CHECK ("clinic_app"."payment_refunds"."amount_minor" between 1 and 99999999),
	CONSTRAINT "refund_reason" CHECK (length(trim("clinic_app"."payment_refunds"."reason")) between 3 and 500),
	CONSTRAINT "refund_currency" CHECK ("clinic_app"."payment_refunds"."currency"='PKR')
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."payment_allocations" ADD CONSTRAINT "allocation_scope_unique" UNIQUE("clinic_id","branch_id","patient_id","payment_id","id");
--> statement-breakpoint
ALTER TABLE "clinic_app"."allocation_reversals" ADD CONSTRAINT "reversal_allocation_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","payment_id","allocation_id") REFERENCES "clinic_app"."payment_allocations"("clinic_id","branch_id","patient_id","payment_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."allocation_reversals" ADD CONSTRAINT "reversal_refund_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","payment_id","refund_id") REFERENCES "clinic_app"."payment_refunds"("clinic_id","branch_id","patient_id","payment_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."payment_refunds" ADD CONSTRAINT "refund_payment_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","payment_id") REFERENCES "clinic_app"."payments"("clinic_id","branch_id","patient_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."payment_refunds" ADD CONSTRAINT "refund_actor_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

--> statement-breakpoint
INSERT INTO clinic_app.permissions(key,description) VALUES ('refund.post','Record reviewed payment refunds');
--> statement-breakpoint
GRANT SELECT, INSERT ON clinic_app.payment_refunds,clinic_app.allocation_reversals TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER refunds_immutable BEFORE UPDATE OR DELETE ON clinic_app.payment_refunds FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER reversals_immutable BEFORE UPDATE OR DELETE ON clinic_app.allocation_reversals FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER refunds_no_truncate BEFORE TRUNCATE ON clinic_app.payment_refunds FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER reversals_no_truncate BEFORE TRUNCATE ON clinic_app.allocation_reversals FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
