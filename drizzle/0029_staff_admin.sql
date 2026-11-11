-- Staff administration by a clinic's own owner. The runtime role still has no direct writes on memberships,
-- roles or grants: each function below checks that its caller is an active member holding user.manage in the
-- named clinic and branch, applies the change inside that clinic only, and writes the clinic audit record.
CREATE FUNCTION clinic_app.require_staff_admin(p_auth uuid, p_clinic uuid, p_branch uuid) RETURNS uuid LANGUAGE plpgsql STABLE SET search_path = clinic_app, pg_temp AS $$
DECLARE v_member uuid;
BEGIN
  SELECT m.id INTO v_member FROM clinic_app.app_users u
    JOIN clinic_app.memberships m ON m.user_id = u.id AND m.active
    JOIN clinic_app.clinics c ON c.id = m.clinic_id AND c.status = 'active'
    JOIN clinic_app.membership_branches mb ON mb.membership_id = m.id AND mb.clinic_id = m.clinic_id
    JOIN clinic_app.branches b ON b.id = mb.branch_id AND b.clinic_id = m.clinic_id AND b.active
    WHERE u.auth_user_id = p_auth AND u.active AND m.clinic_id = p_clinic AND b.id = p_branch;
  IF v_member IS NULL OR NOT (
    EXISTS (SELECT 1 FROM clinic_app.membership_grants g WHERE g.membership_id = v_member AND g.clinic_id = p_clinic AND g.permission = 'user.manage')
    OR EXISTS (SELECT 1 FROM clinic_app.membership_roles mr JOIN clinic_app.role_permissions rp ON rp.role_id = mr.role_id AND rp.clinic_id = mr.clinic_id WHERE mr.membership_id = v_member AND mr.clinic_id = p_clinic AND rp.permission = 'user.manage')
  ) THEN RAISE EXCEPTION 'STAFF_ADMIN_FORBIDDEN' USING ERRCODE = 'P0001'; END IF;
  RETURN v_member;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION clinic_app.require_staff_admin(uuid, uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION clinic_app.staff_audit(p_clinic uuid, p_branch uuid, p_actor uuid, p_action text, p_entity uuid, p_request uuid) RETURNS void LANGUAGE sql SET search_path = clinic_app, pg_temp AS $$
  INSERT INTO clinic_app.audit_events(clinic_id, branch_id, actor_membership_id, action, entity_type, entity_id, request_id) VALUES (p_clinic, p_branch, p_actor, p_action, 'membership', p_entity, p_request);
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION clinic_app.staff_audit(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
-- Adds any missing starting role for a clinic created before roles existed. Never changes an existing role.
CREATE FUNCTION clinic_app.staff_ensure_roles(p_auth uuid, p_clinic uuid, p_branch uuid, p_roles jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = clinic_app, pg_temp AS $$
DECLARE v_actor uuid := clinic_app.require_staff_admin(p_auth, p_clinic, p_branch); v_name text; v_role uuid; v_count integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinic::text || ':staff-admin', 0));
  FOR v_name IN SELECT jsonb_object_keys(p_roles) LOOP
    IF NOT EXISTS (SELECT 1 FROM clinic_app.roles WHERE clinic_id = p_clinic AND name = v_name) THEN
      INSERT INTO clinic_app.roles(clinic_id, name) VALUES (p_clinic, v_name) RETURNING id INTO v_role;
      INSERT INTO clinic_app.role_permissions(clinic_id, role_id, permission) SELECT p_clinic, v_role, value FROM jsonb_array_elements_text(p_roles->v_name);
      PERFORM clinic_app.staff_audit(p_clinic, p_branch, v_actor, 'staff.role_template.created:' || v_name, v_actor, gen_random_uuid());
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END $$;
--> statement-breakpoint
CREATE FUNCTION clinic_app.staff_invite(p_auth uuid, p_clinic uuid, p_branch uuid, p_invite jsonb, p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = clinic_app, pg_temp AS $$
DECLARE v_actor uuid := clinic_app.require_staff_admin(p_auth, p_clinic, p_branch); v_roles text[]; v_target uuid := (p_invite->>'branchId')::uuid; v_email text := lower(trim(p_invite->>'email')); v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinic::text || ':staff-invites', 0));
  IF NOT EXISTS (SELECT 1 FROM clinic_app.branches WHERE clinic_id = p_clinic AND id = v_target AND active) THEN RAISE EXCEPTION 'BRANCH_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  SELECT array_agg(DISTINCT value ORDER BY value) INTO v_roles FROM jsonb_array_elements_text(p_invite->'roleNames');
  IF v_roles IS NULL OR EXISTS (SELECT 1 FROM unnest(v_roles) r WHERE NOT EXISTS (SELECT 1 FROM clinic_app.roles WHERE clinic_id = p_clinic AND name = r)) THEN RAISE EXCEPTION 'ROLES_UNAVAILABLE' USING ERRCODE = 'P0001'; END IF;
  UPDATE clinic_app.staff_invites SET status = 'revoked', resolved_at = now() WHERE clinic_id = p_clinic AND email = v_email AND status = 'pending';
  INSERT INTO clinic_app.staff_invites(clinic_id, branch_id, email, display_name, role_names, invited_by_membership_id)
    VALUES (p_clinic, v_target, v_email, trim(p_invite->>'displayName'), v_roles, v_actor) RETURNING id INTO v_id;
  PERFORM clinic_app.staff_audit(p_clinic, p_branch, v_actor, 'staff.invited', v_id, p_request);
  RETURN v_id;
END $$;
--> statement-breakpoint
CREATE FUNCTION clinic_app.staff_set_invite(p_auth uuid, p_clinic uuid, p_branch uuid, p_invite uuid, p_delivery text, p_revoke boolean, p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = clinic_app, pg_temp AS $$
DECLARE v_actor uuid := clinic_app.require_staff_admin(p_auth, p_clinic, p_branch); v_found uuid;
BEGIN
  IF p_revoke THEN
    UPDATE clinic_app.staff_invites SET status = 'revoked', resolved_at = now() WHERE id = p_invite AND clinic_id = p_clinic AND status = 'pending' RETURNING id INTO v_found;
    IF v_found IS NULL THEN RAISE EXCEPTION 'INVITE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    PERFORM clinic_app.staff_audit(p_clinic, p_branch, v_actor, 'staff.invite.revoked', p_invite, p_request);
  ELSE
    UPDATE clinic_app.staff_invites SET delivery = p_delivery WHERE id = p_invite AND clinic_id = p_clinic RETURNING id INTO v_found;
    IF v_found IS NULL THEN RAISE EXCEPTION 'INVITE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  END IF;
END $$;
--> statement-breakpoint
-- Replaces one member's roles, extra permissions, branches and active flag. Each difference is audited by name.
CREATE FUNCTION clinic_app.staff_update_member(p_auth uuid, p_clinic uuid, p_branch uuid, p_member uuid, p_change jsonb, p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = clinic_app, pg_temp AS $$
DECLARE v_actor uuid := clinic_app.require_staff_admin(p_auth, p_clinic, p_branch); v_active boolean; v_new_active boolean := (p_change->>'active')::boolean;
  v_roles text[]; v_grants text[]; v_branches uuid[]; v_item text; v_branch uuid; v_had_owner boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinic::text || ':staff-admin', 0));
  SELECT active INTO v_active FROM clinic_app.memberships WHERE id = p_member AND clinic_id = p_clinic FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  SELECT EXISTS (SELECT 1 FROM clinic_app.memberships m JOIN clinic_app.app_users u ON u.id = m.user_id AND u.active
      JOIN clinic_app.membership_roles mr ON mr.membership_id = m.id AND mr.clinic_id = m.clinic_id JOIN clinic_app.roles r ON r.id = mr.role_id AND r.name = 'owner'
      WHERE m.clinic_id = p_clinic AND m.active) INTO v_had_owner;
  SELECT coalesce(array_agg(DISTINCT value), '{}') INTO v_roles FROM jsonb_array_elements_text(p_change->'roleNames');
  SELECT coalesce(array_agg(DISTINCT value), '{}') INTO v_grants FROM jsonb_array_elements_text(p_change->'grants');
  SELECT coalesce(array_agg(DISTINCT value::uuid), '{}') INTO v_branches FROM jsonb_array_elements_text(p_change->'branchIds');
  IF EXISTS (SELECT 1 FROM unnest(v_roles) r WHERE NOT EXISTS (SELECT 1 FROM clinic_app.roles WHERE clinic_id = p_clinic AND name = r)) THEN RAISE EXCEPTION 'ROLES_UNAVAILABLE' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_grants) g WHERE NOT EXISTS (SELECT 1 FROM clinic_app.permissions WHERE key = g)) THEN RAISE EXCEPTION 'PERMISSION_UNKNOWN' USING ERRCODE = 'P0001'; END IF;
  IF cardinality(v_branches) = 0 OR EXISTS (SELECT 1 FROM unnest(v_branches) b WHERE NOT EXISTS (SELECT 1 FROM clinic_app.branches WHERE clinic_id = p_clinic AND id = b)) THEN RAISE EXCEPTION 'BRANCH_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF p_member = v_actor AND NOT v_new_active THEN RAISE EXCEPTION 'CANNOT_DEACTIVATE_SELF' USING ERRCODE = 'P0001'; END IF;

  FOR v_item IN SELECT r.name FROM clinic_app.membership_roles mr JOIN clinic_app.roles r ON r.id = mr.role_id WHERE mr.membership_id = p_member AND mr.clinic_id = p_clinic AND NOT (r.name = ANY(v_roles)) LOOP
    DELETE FROM clinic_app.membership_roles mr USING clinic_app.roles r WHERE r.id = mr.role_id AND mr.membership_id = p_member AND mr.clinic_id = p_clinic AND r.name = v_item;
    PERFORM clinic_app.staff_audit(p_clinic, p_branch, v_actor, 'staff.role.removed:' || v_item, p_member, p_request);
  END LOOP;
  FOR v_item IN SELECT r FROM unnest(v_roles) r WHERE NOT EXISTS (SELECT 1 FROM clinic_app.membership_roles mr JOIN clinic_app.roles ro ON ro.id = mr.role_id WHERE mr.membership_id = p_member AND mr.clinic_id = p_clinic AND ro.name = r) LOOP
    INSERT INTO clinic_app.membership_roles(clinic_id, membership_id, role_id) SELECT p_clinic, p_member, id FROM clinic_app.roles WHERE clinic_id = p_clinic AND name = v_item;
    PERFORM clinic_app.staff_audit(p_clinic, p_branch, v_actor, 'staff.role.added:' || v_item, p_member, p_request);
  END LOOP;
  FOR v_item IN SELECT permission FROM clinic_app.membership_grants WHERE membership_id = p_member AND clinic_id = p_clinic AND NOT (permission = ANY(v_grants)) LOOP
    DELETE FROM clinic_app.membership_grants WHERE membership_id = p_member AND clinic_id = p_clinic AND permission = v_item;
    PERFORM clinic_app.staff_audit(p_clinic, p_branch, v_actor, 'staff.permission.removed:' || v_item, p_member, p_request);
  END LOOP;
  FOR v_item IN SELECT g FROM unnest(v_grants) g WHERE NOT EXISTS (SELECT 1 FROM clinic_app.membership_grants WHERE membership_id = p_member AND clinic_id = p_clinic AND permission = g) LOOP
    INSERT INTO clinic_app.membership_grants(clinic_id, membership_id, permission) VALUES (p_clinic, p_member, v_item);
    PERFORM clinic_app.staff_audit(p_clinic, p_branch, v_actor, 'staff.permission.added:' || v_item, p_member, p_request);
  END LOOP;
  FOR v_branch IN SELECT branch_id FROM clinic_app.membership_branches WHERE membership_id = p_member AND clinic_id = p_clinic AND NOT (branch_id = ANY(v_branches)) LOOP
    DELETE FROM clinic_app.membership_branches WHERE membership_id = p_member AND clinic_id = p_clinic AND branch_id = v_branch;
    PERFORM clinic_app.staff_audit(p_clinic, p_branch, v_actor, 'staff.branch.removed', p_member, p_request);
  END LOOP;
  FOR v_branch IN SELECT b FROM unnest(v_branches) b WHERE NOT EXISTS (SELECT 1 FROM clinic_app.membership_branches WHERE membership_id = p_member AND clinic_id = p_clinic AND branch_id = b) LOOP
    INSERT INTO clinic_app.membership_branches(clinic_id, membership_id, branch_id) VALUES (p_clinic, p_member, v_branch);
    PERFORM clinic_app.staff_audit(p_clinic, p_branch, v_actor, 'staff.branch.added', p_member, p_request);
  END LOOP;
  IF v_active <> v_new_active THEN
    UPDATE clinic_app.memberships SET active = v_new_active WHERE id = p_member AND clinic_id = p_clinic;
    PERFORM clinic_app.staff_audit(p_clinic, p_branch, v_actor, CASE WHEN v_new_active THEN 'staff.reactivated' ELSE 'staff.deactivated' END, p_member, p_request);
  END IF;
  -- A clinic must always keep at least one active owner, or nobody could manage its staff again.
  IF v_had_owner AND NOT EXISTS (SELECT 1 FROM clinic_app.memberships m JOIN clinic_app.app_users u ON u.id = m.user_id AND u.active
      JOIN clinic_app.membership_roles mr ON mr.membership_id = m.id AND mr.clinic_id = m.clinic_id JOIN clinic_app.roles r ON r.id = mr.role_id AND r.name = 'owner'
      WHERE m.clinic_id = p_clinic AND m.active) THEN RAISE EXCEPTION 'LAST_OWNER' USING ERRCODE = 'P0001'; END IF;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION clinic_app.staff_ensure_roles(uuid, uuid, uuid, jsonb), clinic_app.staff_invite(uuid, uuid, uuid, jsonb, uuid),
  clinic_app.staff_set_invite(uuid, uuid, uuid, uuid, text, boolean, uuid), clinic_app.staff_update_member(uuid, uuid, uuid, uuid, jsonb, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION clinic_app.staff_ensure_roles(uuid, uuid, uuid, jsonb), clinic_app.staff_invite(uuid, uuid, uuid, jsonb, uuid),
  clinic_app.staff_set_invite(uuid, uuid, uuid, uuid, text, boolean, uuid), clinic_app.staff_update_member(uuid, uuid, uuid, uuid, jsonb, uuid) TO clinic_runtime;
