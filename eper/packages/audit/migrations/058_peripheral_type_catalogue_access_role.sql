-- Dedicated least-privilege login group for the platform peripheral type catalogue.
-- Login credentials are provisioned by the database operator; this migration stores no passwords.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
                  WHERE rolname = 'eper_peripheral_type_catalogue_access') THEN
    CREATE ROLE eper_peripheral_type_catalogue_access
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE eper_peripheral_type_catalogue_access
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO eper_peripheral_type_catalogue_access;

-- The runtime uses SET LOCAL ROLE only after authenticating with a login role
-- explicitly granted membership by the database operator.
GRANT SELECT, INSERT ON eper_peripheral_type_definitions TO eper_peripheral_type_catalogue_access;
GRANT UPDATE (lifecycle_status, updated_at, updated_by)
  ON eper_peripheral_type_definitions TO eper_peripheral_type_catalogue_access;

GRANT SELECT, INSERT ON eper_peripheral_type_schema_versions
  TO eper_peripheral_type_catalogue_access;
GRANT SELECT, INSERT ON eper_peripheral_type_schema_lifecycle
  TO eper_peripheral_type_catalogue_access;
GRANT UPDATE (lifecycle_status, changed_at, changed_by)
  ON eper_peripheral_type_schema_lifecycle TO eper_peripheral_type_catalogue_access;

GRANT SELECT, INSERT ON eper_peripheral_type_catalogue_events
  TO eper_peripheral_type_catalogue_access;

-- The repository appends audit events in the same transaction as each catalogue
-- mutation and advances only the shared chain head. Existing events remain immutable.
GRANT INSERT ON eper_audit_events TO eper_peripheral_type_catalogue_access;
GRANT SELECT ON eper_audit_chain_head TO eper_peripheral_type_catalogue_access;
GRANT UPDATE (last_event_hash, updated_at) ON eper_audit_chain_head
  TO eper_peripheral_type_catalogue_access;

COMMIT;
