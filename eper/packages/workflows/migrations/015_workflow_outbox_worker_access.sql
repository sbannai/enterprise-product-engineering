-- Restricted, non-login privilege group for the independently hosted workflow outbox worker.
-- A DBA provisions a separate LOGIN role and grants it membership after this migration.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eper_workflow_outbox_worker_access') THEN
    CREATE ROLE eper_workflow_outbox_worker_access NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE eper_workflow_outbox_worker_access
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO eper_workflow_outbox_worker_access;

-- Context discovery is read-only. Outbox events are immutable; the worker can read
-- them and the delivery projection, but may update only the delivery-state columns.
GRANT SELECT ON eper_tenant_application_assignment,
                eper_workflow_outbox_events,
                eper_workflow_outbox_delivery
  TO eper_workflow_outbox_worker_access;

GRANT UPDATE (
  delivery_status,
  attempts,
  available_at,
  locked_at,
  locked_by,
  last_error,
  delivered_at,
  updated_at
) ON eper_workflow_outbox_delivery TO eper_workflow_outbox_worker_access;

COMMIT;
