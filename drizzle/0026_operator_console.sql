CREATE TABLE "clinic_app"."operator_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" uuid NOT NULL,
	"clinic_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_audit_action_nonempty" CHECK (length(trim("clinic_app"."operator_audit_events"."action")) > 0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."platform_operators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_operators_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "platform_operators_name_nonempty" CHECK (length(trim("clinic_app"."platform_operators"."display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "clinic_app"."staff_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role_names" text[] NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"delivery" text DEFAULT 'not_sent' NOT NULL,
	"invited_by_operator_id" uuid,
	"invited_by_membership_id" uuid,
	"accepted_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "staff_invites_email_format" CHECK ("clinic_app"."staff_invites"."email" = lower(trim("clinic_app"."staff_invites"."email")) and "clinic_app"."staff_invites"."email" ~ '^[^@\s]+@[^@\s]+$' and length("clinic_app"."staff_invites"."email") <= 254),
	CONSTRAINT "staff_invites_name_nonempty" CHECK (length(trim("clinic_app"."staff_invites"."display_name")) between 1 and 120),
	CONSTRAINT "staff_invites_status_valid" CHECK ("clinic_app"."staff_invites"."status" in ('pending','accepted','revoked')),
	CONSTRAINT "staff_invites_delivery_valid" CHECK ("clinic_app"."staff_invites"."delivery" in ('not_sent','email_sent','existing_account','failed')),
	CONSTRAINT "staff_invites_roles_nonempty" CHECK (cardinality("clinic_app"."staff_invites"."role_names") > 0),
	CONSTRAINT "staff_invites_inviter_present" CHECK (("clinic_app"."staff_invites"."invited_by_operator_id" is not null) <> ("clinic_app"."staff_invites"."invited_by_membership_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD COLUMN "city" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD COLUMN "plan_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD COLUMN "paid_until" date;--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD COLUMN "created_operation_id" uuid;--> statement-breakpoint
ALTER TABLE "clinic_app"."operator_audit_events" ADD CONSTRAINT "operator_audit_events_operator_id_platform_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "clinic_app"."platform_operators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."operator_audit_events" ADD CONSTRAINT "operator_audit_events_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "clinic_app"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."staff_invites" ADD CONSTRAINT "staff_invites_invited_by_operator_id_platform_operators_id_fk" FOREIGN KEY ("invited_by_operator_id") REFERENCES "clinic_app"."platform_operators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."staff_invites" ADD CONSTRAINT "staff_invites_branch_scope_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."staff_invites" ADD CONSTRAINT "staff_invites_inviter_scope_fk" FOREIGN KEY ("clinic_id","invited_by_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."staff_invites" ADD CONSTRAINT "staff_invites_accepted_scope_fk" FOREIGN KEY ("clinic_id","accepted_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operator_audit_clinic_idx" ON "clinic_app"."operator_audit_events" USING btree ("clinic_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invites_pending_email_unique" ON "clinic_app"."staff_invites" USING btree ("clinic_id","email") WHERE "clinic_app"."staff_invites"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "staff_invites_email_idx" ON "clinic_app"."staff_invites" USING btree ("email","status");--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD CONSTRAINT "clinics_created_operation_id_unique" UNIQUE("created_operation_id");--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD CONSTRAINT "clinics_status_valid" CHECK ("clinic_app"."clinics"."status" in ('active','suspended'));--> statement-breakpoint
ALTER TABLE "clinic_app"."clinics" ADD CONSTRAINT "clinics_plan_note_length" CHECK (length("clinic_app"."clinics"."plan_note") <= 500);--> statement-breakpoint
CREATE TRIGGER operator_audit_events_immutable BEFORE UPDATE OR DELETE ON clinic_app.operator_audit_events FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER operator_audit_events_no_truncate BEFORE TRUNCATE ON clinic_app.operator_audit_events FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_audit_mutation();
--> statement-breakpoint
-- The runtime role still has no direct organization writes. Operator actions and invite acceptance run through
-- the SECURITY DEFINER functions below, each of which verifies its caller and writes its own audit record.
GRANT SELECT ON clinic_app.platform_operators, clinic_app.operator_audit_events, clinic_app.staff_invites TO clinic_runtime;
--> statement-breakpoint
CREATE FUNCTION clinic_app.require_operator(p_auth uuid) RETURNS uuid LANGUAGE plpgsql STABLE SET search_path = clinic_app, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM clinic_app.platform_operators WHERE auth_user_id = p_auth AND active;
  IF v_id IS NULL THEN RAISE EXCEPTION 'OPERATOR_FORBIDDEN' USING ERRCODE = 'P0001'; END IF;
  RETURN v_id;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION clinic_app.require_operator(uuid) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION clinic_app.operator_invite_owner(p_auth uuid, p_clinic uuid, p_owner jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = clinic_app, pg_temp AS $$
DECLARE v_operator uuid := clinic_app.require_operator(p_auth); v_branch uuid; v_invite uuid; v_roles text[];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinic::text || ':staff-invites', 0));
  SELECT id INTO v_branch FROM clinic_app.branches WHERE clinic_id = p_clinic AND active ORDER BY created_at, id LIMIT 1;
  IF v_branch IS NULL THEN RAISE EXCEPTION 'CLINIC_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  SELECT array_agg(value ORDER BY value) INTO v_roles FROM jsonb_array_elements_text(p_owner->'roleNames');
  IF v_roles IS NULL OR NOT ('owner' = ANY(v_roles)) OR EXISTS (SELECT 1 FROM unnest(v_roles) r WHERE NOT EXISTS (SELECT 1 FROM clinic_app.roles WHERE clinic_id = p_clinic AND name = r)) THEN
    RAISE EXCEPTION 'ROLES_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;
  UPDATE clinic_app.staff_invites SET status = 'revoked', resolved_at = now()
    WHERE clinic_id = p_clinic AND status = 'pending' AND (invited_by_operator_id IS NOT NULL OR email = lower(trim(p_owner->>'email')));
  INSERT INTO clinic_app.staff_invites(clinic_id, branch_id, email, display_name, role_names, invited_by_operator_id)
    VALUES (p_clinic, v_branch, lower(trim(p_owner->>'email')), trim(p_owner->>'displayName'), v_roles, v_operator) RETURNING id INTO v_invite;
  INSERT INTO clinic_app.operator_audit_events(operator_id, clinic_id, action, entity_type, entity_id, detail)
    VALUES (v_operator, p_clinic, 'operator.owner.invited', 'staff_invite', v_invite, jsonb_build_object('roles', v_roles));
  RETURN v_invite;
END $$;
--> statement-breakpoint
CREATE FUNCTION clinic_app.operator_create_clinic(p_auth uuid, p_operation uuid, p_payload_hash text, p_clinic jsonb, p_owner jsonb, p_roles jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = clinic_app, pg_temp AS $$
DECLARE v_operator uuid := clinic_app.require_operator(p_auth); v_clinic uuid; v_branch uuid; v_role uuid; v_invite uuid; v_hash text; v_name text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text || ':operator-create-clinic', 0));
  SELECT c.id, e.detail->>'payloadHash' INTO v_clinic, v_hash FROM clinic_app.clinics c
    JOIN clinic_app.operator_audit_events e ON e.entity_id = c.id AND e.action = 'operator.clinic.created' WHERE c.created_operation_id = p_operation;
  IF v_clinic IS NOT NULL THEN
    IF v_hash IS DISTINCT FROM p_payload_hash THEN RAISE EXCEPTION 'OPERATION_CONFLICT' USING ERRCODE = 'P0001'; END IF;
    SELECT id INTO v_branch FROM clinic_app.branches WHERE clinic_id = v_clinic ORDER BY created_at, id LIMIT 1;
    SELECT id INTO v_invite FROM clinic_app.staff_invites WHERE clinic_id = v_clinic AND invited_by_operator_id IS NOT NULL ORDER BY created_at, id LIMIT 1;
    RETURN jsonb_build_object('clinicId', v_clinic, 'branchId', v_branch, 'inviteId', v_invite, 'replayed', true);
  END IF;
  INSERT INTO clinic_app.clinics(name, currency, timezone, city, phone, plan_note, paid_until, created_operation_id)
    VALUES (trim(p_clinic->>'name'), 'PKR', p_clinic->>'timezone', trim(coalesce(p_clinic->>'city', '')), trim(coalesce(p_clinic->>'phone', '')), trim(coalesce(p_clinic->>'planNote', '')), nullif(p_clinic->>'paidUntil', '')::date, p_operation)
    RETURNING id INTO v_clinic;
  INSERT INTO clinic_app.branches(clinic_id, name) VALUES (v_clinic, trim(p_clinic->>'branchName')) RETURNING id INTO v_branch;
  FOR v_name IN SELECT jsonb_object_keys(p_roles) LOOP
    INSERT INTO clinic_app.roles(clinic_id, name) VALUES (v_clinic, v_name) RETURNING id INTO v_role;
    INSERT INTO clinic_app.role_permissions(clinic_id, role_id, permission) SELECT v_clinic, v_role, value FROM jsonb_array_elements_text(p_roles->v_name);
  END LOOP;
  INSERT INTO clinic_app.operator_audit_events(operator_id, clinic_id, action, entity_type, entity_id, detail)
    VALUES (v_operator, v_clinic, 'operator.clinic.created', 'clinic', v_clinic, jsonb_build_object('payloadHash', p_payload_hash, 'branchId', v_branch));
  v_invite := clinic_app.operator_invite_owner(p_auth, v_clinic, p_owner);
  RETURN jsonb_build_object('clinicId', v_clinic, 'branchId', v_branch, 'inviteId', v_invite, 'replayed', false);
END $$;
--> statement-breakpoint
CREATE FUNCTION clinic_app.operator_update_clinic(p_auth uuid, p_clinic uuid, p_status text, p_plan_note text, p_paid_until date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = clinic_app, pg_temp AS $$
DECLARE v_operator uuid := clinic_app.require_operator(p_auth); v_before clinic_app.clinics%ROWTYPE;
BEGIN
  SELECT * INTO v_before FROM clinic_app.clinics WHERE id = p_clinic FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLINIC_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  UPDATE clinic_app.clinics SET status = p_status, plan_note = trim(p_plan_note), paid_until = p_paid_until WHERE id = p_clinic;
  INSERT INTO clinic_app.operator_audit_events(operator_id, clinic_id, action, entity_type, entity_id, detail)
    VALUES (v_operator, p_clinic, CASE WHEN v_before.status <> p_status THEN CASE p_status WHEN 'suspended' THEN 'operator.clinic.suspended' ELSE 'operator.clinic.reactivated' END ELSE 'operator.clinic.billing_updated' END,
      'clinic', p_clinic, jsonb_build_object('before', jsonb_build_object('status', v_before.status, 'planNote', v_before.plan_note, 'paidUntil', v_before.paid_until), 'after', jsonb_build_object('status', p_status, 'planNote', trim(p_plan_note), 'paidUntil', p_paid_until)));
END $$;
--> statement-breakpoint
CREATE FUNCTION clinic_app.operator_record_invite_delivery(p_auth uuid, p_invite uuid, p_delivery text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = clinic_app, pg_temp AS $$
DECLARE v_operator uuid := clinic_app.require_operator(p_auth); v_clinic uuid;
BEGIN
  UPDATE clinic_app.staff_invites SET delivery = p_delivery WHERE id = p_invite AND invited_by_operator_id IS NOT NULL RETURNING clinic_id INTO v_clinic;
  IF v_clinic IS NULL THEN RAISE EXCEPTION 'INVITE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO clinic_app.operator_audit_events(operator_id, clinic_id, action, entity_type, entity_id, detail)
    VALUES (v_operator, v_clinic, 'operator.owner.invite_delivery', 'staff_invite', p_invite, jsonb_build_object('delivery', p_delivery));
END $$;
--> statement-breakpoint
-- Called after sign-in with the verified Auth identity and its email. Binds every pending invite for that email.
CREATE FUNCTION clinic_app.accept_staff_invites(p_auth uuid, p_email text, p_request uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = clinic_app, pg_temp AS $$
DECLARE v_email text := lower(trim(p_email)); v_invite clinic_app.staff_invites%ROWTYPE; v_user uuid; v_user_active boolean; v_member uuid; v_count integer := 0;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_email || ':accept-invites', 0));
  FOR v_invite IN SELECT * FROM clinic_app.staff_invites WHERE email = v_email AND status = 'pending' ORDER BY created_at, id FOR UPDATE LOOP
    SELECT id, active INTO v_user, v_user_active FROM clinic_app.app_users WHERE auth_user_id = p_auth;
    IF v_user IS NULL THEN
      INSERT INTO clinic_app.app_users(auth_user_id, display_name) VALUES (p_auth, v_invite.display_name) RETURNING id INTO v_user;
    ELSIF NOT v_user_active THEN CONTINUE;
    END IF;
    SELECT id INTO v_member FROM clinic_app.memberships WHERE clinic_id = v_invite.clinic_id AND user_id = v_user;
    IF v_member IS NULL THEN
      INSERT INTO clinic_app.memberships(clinic_id, user_id) VALUES (v_invite.clinic_id, v_user) RETURNING id INTO v_member;
    ELSE
      UPDATE clinic_app.memberships SET active = true WHERE id = v_member;
    END IF;
    INSERT INTO clinic_app.membership_branches(clinic_id, membership_id, branch_id) VALUES (v_invite.clinic_id, v_member, v_invite.branch_id) ON CONFLICT DO NOTHING;
    INSERT INTO clinic_app.membership_roles(clinic_id, membership_id, role_id)
      SELECT v_invite.clinic_id, v_member, r.id FROM clinic_app.roles r WHERE r.clinic_id = v_invite.clinic_id AND r.name = ANY(v_invite.role_names) ON CONFLICT DO NOTHING;
    UPDATE clinic_app.staff_invites SET status = 'accepted', accepted_membership_id = v_member, resolved_at = now() WHERE id = v_invite.id;
    INSERT INTO clinic_app.audit_events(clinic_id, branch_id, actor_membership_id, action, entity_type, entity_id, request_id)
      VALUES (v_invite.clinic_id, v_invite.branch_id, v_member, 'staff.invite.accepted', 'membership', v_member, p_request);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION clinic_app.operator_invite_owner(uuid, uuid, jsonb), clinic_app.operator_create_clinic(uuid, uuid, text, jsonb, jsonb, jsonb),
  clinic_app.operator_update_clinic(uuid, uuid, text, text, date), clinic_app.operator_record_invite_delivery(uuid, uuid, text), clinic_app.accept_staff_invites(uuid, text, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION clinic_app.operator_invite_owner(uuid, uuid, jsonb), clinic_app.operator_create_clinic(uuid, uuid, text, jsonb, jsonb, jsonb),
  clinic_app.operator_update_clinic(uuid, uuid, text, text, date), clinic_app.operator_record_invite_delivery(uuid, uuid, text), clinic_app.accept_staff_invites(uuid, text, uuid) TO clinic_runtime;
