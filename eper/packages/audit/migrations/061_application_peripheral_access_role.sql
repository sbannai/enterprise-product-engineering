-- Dedicated least-privilege runtime role for application peripheral persistence.
-- Login credentials and role membership are provisioned by the database operator.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'eper_application_peripheral_access'
  ) THEN
    CREATE ROLE eper_application_peripheral_access
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE eper_application_peripheral_access
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO eper_application_peripheral_access;

-- Registration reads and creation; updates are restricted to service-managed
-- configuration, lifecycle, optimistic version, and update-audit columns.
GRANT SELECT, INSERT ON public.eper_application_peripheral
  TO eper_application_peripheral_access;
GRANT UPDATE (
  adapter_key,
  adapter_version,
  active_configuration_version,
  lifecycle_status,
  version,
  updated_by,
  updated_at
) ON public.eper_application_peripheral
  TO eper_application_peripheral_access;

-- Configuration history is append-only. The database trigger independently
-- rejects UPDATE and DELETE.
GRANT SELECT, INSERT ON public.eper_application_peripheral_configuration
  TO eper_application_peripheral_access;

-- Append-only audit events and narrowly scoped audit-chain advancement.
GRANT INSERT ON public.eper_audit_events
  TO eper_application_peripheral_access;
GRANT SELECT ON public.eper_audit_chain_head
  TO eper_application_peripheral_access;
GRANT UPDATE (last_event_hash, updated_at)
  ON public.eper_audit_chain_head
  TO eper_application_peripheral_access;

COMMIT;
