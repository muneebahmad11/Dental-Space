-- A separate, non-owner role. Local setup enables LOGIN with a separate password.
-- Intentionally fail if the role already exists; inspect it instead of reusing unknown privileges.
CREATE ROLE clinic_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
--> statement-breakpoint
REVOKE ALL ON SCHEMA clinic_app FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA clinic_app FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA clinic_app FROM PUBLIC;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA clinic_app REVOKE ALL ON TABLES FROM PUBLIC;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA clinic_app REVOKE ALL ON SEQUENCES FROM PUBLIC;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA clinic_app REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--> statement-breakpoint
-- Supabase roles do not exist on a plain local PostgreSQL installation.
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA clinic_app FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA clinic_app FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA clinic_app FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA clinic_app REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA clinic_app REVOKE ALL ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA clinic_app REVOKE EXECUTE ON FUNCTIONS FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA clinic_app TO clinic_runtime;
--> statement-breakpoint
-- Only identity/context reads are needed at this stage. No blanket write grants.
GRANT SELECT ON clinic_app.clinics, clinic_app.branches, clinic_app.app_users,
  clinic_app.memberships, clinic_app.membership_branches TO clinic_runtime;
