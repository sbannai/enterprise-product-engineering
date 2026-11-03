-- Least-privilege group roles for the isolated Product Admin and provider-catalogue pools.
-- Login roles and credentials are provisioned by the database operator and granted membership
-- in these NOLOGIN roles; this migration never creates or stores passwords.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eper_platform_admin_access') THEN
    CREATE ROLE eper_platform_admin_access NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eper_provider_catalogue_access') THEN
    CREATE ROLE eper_provider_catalogue_access NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE eper_platform_admin_access NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE eper_provider_catalogue_access NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO eper_platform_admin_access, eper_provider_catalogue_access;

-- Both services append to the shared integrity chain. They may insert audit events and
-- advance only the chain-head hash/timestamp; neither can update or delete prior events.
GRANT INSERT ON eper_audit_events TO eper_platform_admin_access, eper_provider_catalogue_access;
GRANT SELECT ON eper_audit_chain_head TO eper_platform_admin_access, eper_provider_catalogue_access;
GRANT UPDATE (last_event_hash, updated_at) ON eper_audit_chain_head
  TO eper_platform_admin_access, eper_provider_catalogue_access;

-- Product Admin credentials: issue, resolve (last_used_at), and revoke (revoked_at).
-- No credential deletion and no mutation of identity, permissions, token hash or expiry.
GRANT SELECT, INSERT ON eper_platform_admin_credentials TO eper_platform_admin_access;
GRANT UPDATE (last_used_at, revoked_at) ON eper_platform_admin_credentials
  TO eper_platform_admin_access;

-- Provider catalogue definitions are platform-global; connection data remains tenant-scoped
-- by the existing FORCE ROW LEVEL SECURITY policies and requires eper.tenant_id context.
GRANT SELECT, INSERT ON eper_provider_definitions TO eper_provider_catalogue_access;
GRANT UPDATE (display_name, adapter_key, adapter_version, capabilities, auth_modes,
              configuration_schema, provider_status, version, updated_at, updated_by)
  ON eper_provider_definitions TO eper_provider_catalogue_access;

GRANT SELECT, INSERT ON eper_provider_connections TO eper_provider_catalogue_access;
GRANT UPDATE (secret_reference, connection_status, version, updated_at, updated_by)
  ON eper_provider_connections TO eper_provider_catalogue_access;

GRANT SELECT, INSERT ON eper_provider_connection_applications TO eper_provider_catalogue_access;
GRANT UPDATE (allowed_capabilities, binding_status, version, updated_at, updated_by)
  ON eper_provider_connection_applications TO eper_provider_catalogue_access;

GRANT SELECT, INSERT ON eper_provider_validation_events TO eper_provider_catalogue_access;

COMMIT;
