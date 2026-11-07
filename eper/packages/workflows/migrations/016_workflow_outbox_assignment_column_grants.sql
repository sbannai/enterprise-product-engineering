-- Reduce the workflow worker's global context-discovery grant to the three columns it actually queries.
-- The assignment table contains principal IDs and lifecycle metadata that the worker does not need.
BEGIN;

REVOKE SELECT ON eper_tenant_application_assignment
  FROM eper_workflow_outbox_worker_access;

GRANT SELECT (tenant_id, application_id, assignment_status)
  ON eper_tenant_application_assignment
  TO eper_workflow_outbox_worker_access;

COMMIT;
