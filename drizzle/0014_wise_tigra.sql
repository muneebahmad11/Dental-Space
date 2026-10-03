ALTER TABLE "clinic_app"."appointments" ADD CONSTRAINT "appointments_full_scope_unique" UNIQUE("clinic_id","branch_id","patient_id","id");
--> statement-breakpoint
ALTER TABLE "clinic_app"."communication_jobs" ADD CONSTRAINT "communication_appointment_scope_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","appointment_id") REFERENCES "clinic_app"."appointments"("clinic_id","branch_id","patient_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clinic_app"."visits" ADD CONSTRAINT "visit_appointment_scope_fk" FOREIGN KEY ("clinic_id","branch_id","patient_id","appointment_id") REFERENCES "clinic_app"."appointments"("clinic_id","branch_id","patient_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION clinic_app.protect_visit_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE signed_body jsonb;
BEGIN
 IF (to_jsonb(OLD) - ARRAY['status','version','body','updated_at']) IS DISTINCT FROM
    (to_jsonb(NEW) - ARRAY['status','version','body','updated_at']) THEN
  RAISE EXCEPTION 'Visit identity and authorship are immutable' USING ERRCODE='42501';
 END IF;
 IF OLD.status='finalized' AND NEW.status<>'finalized' THEN
  RAISE EXCEPTION 'Signed visits cannot return to draft' USING ERRCODE='42501';
 END IF;
 IF NEW.status='finalized' THEN
  SELECT body INTO signed_body FROM clinic_app.visit_revisions
   WHERE visit_id=NEW.id AND clinic_id=NEW.clinic_id AND branch_id=NEW.branch_id
   ORDER BY revision DESC LIMIT 1;
  IF signed_body IS NULL OR signed_body IS DISTINCT FROM NEW.body THEN
   RAISE EXCEPTION 'Signed visit projection must match latest immutable revision' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
