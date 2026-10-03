CREATE TABLE "clinic_app"."messaging_webhook_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"recipient" text NOT NULL,
	"status" text NOT NULL,
	"provider_timestamp" timestamp with time zone NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_webhook_event_unique" UNIQUE("event_key"),
	CONSTRAINT "messaging_webhook_status" CHECK ("clinic_app"."messaging_webhook_receipts"."status" in ('sent','delivered','read','failed','opt_out'))
);
--> statement-breakpoint
CREATE INDEX "messaging_webhook_pending_idx" ON "clinic_app"."messaging_webhook_receipts" USING btree ("clinic_id","processed");
--> statement-breakpoint
GRANT SELECT, INSERT ON clinic_app.messaging_webhook_receipts TO clinic_runtime;
--> statement-breakpoint
GRANT UPDATE(processed) ON clinic_app.messaging_webhook_receipts TO clinic_runtime;
--> statement-breakpoint
CREATE TRIGGER webhook_receipts_no_delete BEFORE DELETE ON clinic_app.messaging_webhook_receipts
FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER webhook_receipts_no_truncate BEFORE TRUNCATE ON clinic_app.messaging_webhook_receipts
FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
