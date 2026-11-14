-- Narrow version-counter update grants let the executor lock authorization rows
-- with SELECT FOR SHARE while keeping all membership and permission fields read-only.
BEGIN;
GRANT UPDATE (version) ON eper_actor_application_assignment,
  eper_tenant_application_assignment,
  eper_workflow_actor_role_assignment,
  eper_workflow_role_definition
  TO eper_application_data_executor_access;
COMMIT;
