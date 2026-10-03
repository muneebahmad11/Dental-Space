CREATE FUNCTION clinic_app.protect_webhook_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(OLD) - 'processed') IS DISTINCT FROM (to_jsonb(NEW) - 'processed') THEN
  RAISE EXCEPTION 'Webhook receipt metadata is immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER webhook_receipt_metadata_immutable BEFORE UPDATE ON clinic_app.messaging_webhook_receipts
FOR EACH ROW EXECUTE FUNCTION clinic_app.protect_webhook_receipt();
