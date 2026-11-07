-- Restricted, non-login privilege group for the independently hosted workflow outbox worker.
-- The database operator provisions a separate LOGIN role and grants membership after this migration.
-- Assignment discovery is column-scoped from the first committed migration state.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'eper_workflow_outbox_worker_access'
  ) THEN
    CREATE ROLE eper_workflow_outbox_worker_access
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE eper_workflow_outbox_worker_access
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO eper_workflow_outbox_worker_access;

-- Context discovery reads only the ownership allowlist columns used by the worker.
GRANT SELECT (tenant_id, application_id, assignment_status)
  ON eper_tenant_application_assignment
  TO eper_workflow_outbox_worker_access;

-- Events are immutable. Delivery rows are readable, but only delivery-state columns
-- can be updated. No INSERT, DELETE, or TRUNCATE grant is provided.
GRANT SELECT ON eper_workflow_outbox_events,
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
) ON eper_workflow_outbox_delivery
  TO eper_workflow_outbox_worker_access;

COMMIT;
