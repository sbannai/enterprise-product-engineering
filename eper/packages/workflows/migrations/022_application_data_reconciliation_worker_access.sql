-- Least-privilege capability group for the application-data reconciliation worker.
-- Operators provision a dedicated LOGIN role and grant it membership in this NOLOGIN group.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eper_application_data_reconcile_access') THEN
    CREATE ROLE eper_application_data_reconcile_access
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE eper_application_data_reconcile_access
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO eper_application_data_reconcile_access;

-- Discover only active tenant/application scopes; never read assignment metadata.
GRANT SELECT (tenant_id, application_id, assignment_status)
  ON eper_tenant_application_assignment TO eper_application_data_reconcile_access;

-- Read pinned definitions and the exact workflow/intent state being reconciled.
GRANT SELECT ON eper_workflow_definition_versions,
                eper_workflow_instances,
                eper_workflow_application_data_intents
  TO eper_application_data_reconcile_access;

-- The reconciler may advance only workflow state fields; it cannot rewrite identity,
-- ownership, definition pins, or creation metadata.
GRANT UPDATE (status, current_activity_id, data, pending_activity_execution_id,
              version, updated_at, completed_at)
  ON eper_workflow_instances TO eper_application_data_reconcile_access;

-- Claim/release reconciliation leases and atomically mark the successful intent advanced.
GRANT UPDATE (intent_status, reconciliation_status, reconciliation_attempts,
              reconciliation_available_at, reconciliation_locked_at,
              reconciliation_locked_by, reconciliation_claim_generation,
              completed_at, updated_at)
  ON eper_workflow_application_data_intents TO eper_application_data_reconcile_access;

GRANT INSERT ON eper_workflow_transitions,
                eper_workflow_outbox_events,
                eper_workflow_outbox_delivery
  TO eper_application_data_reconcile_access;

-- Audit events are append-only. The worker can append and advance the chain head,
-- but cannot update/delete prior evidence.
GRANT INSERT ON eper_audit_events TO eper_application_data_reconcile_access;
GRANT SELECT ON eper_audit_chain_head TO eper_application_data_reconcile_access;
GRANT UPDATE (last_event_hash, updated_at)
  ON eper_audit_chain_head TO eper_application_data_reconcile_access;

COMMIT;
