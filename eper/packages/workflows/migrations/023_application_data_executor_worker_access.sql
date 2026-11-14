-- Least-privilege capability group for executing durable application-data activity intents.
-- The deployment operator provisions a dedicated LOGIN role and grants membership.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eper_application_data_executor_access') THEN
    CREATE ROLE eper_application_data_executor_access
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE eper_application_data_executor_access
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO eper_application_data_executor_access;

GRANT SELECT (tenant_id, application_id, assignment_status)
  ON eper_tenant_application_assignment TO eper_application_data_executor_access;

GRANT SELECT ON eper_workflow_application_data_intents
  TO eper_application_data_executor_access;
GRANT SELECT ON eper_actor_application_assignment,
  eper_workflow_actor_role_assignment, eper_workflow_role_definition
  TO eper_application_data_executor_access;

-- PostgreSQL row-locking SELECTs require UPDATE privilege on at least one column.
-- Grant only the non-authoritative version counters so the executor can take
-- FOR SHARE locks without being able to change membership or permission fields.
GRANT UPDATE (version) ON eper_actor_application_assignment,
  eper_tenant_application_assignment, eper_workflow_actor_role_assignment,
  eper_workflow_role_definition TO eper_application_data_executor_access;
GRANT UPDATE (intent_status, attempts, available_at, locked_at, locked_by,
              claim_generation, result, last_error, completed_at, updated_at)
  ON eper_workflow_application_data_intents TO eper_application_data_executor_access;

GRANT SELECT ON eper_application_data_models
  TO eper_application_data_executor_access;
GRANT SELECT, INSERT, UPDATE, DELETE ON eper_application_data_records
  TO eper_application_data_executor_access;
GRANT SELECT, INSERT ON eper_application_data_idempotency
  TO eper_application_data_executor_access;

-- Application-data writes append evidence and an outbox event in the same transaction.
GRANT INSERT ON audit_evidence, transactional_outbox
  TO eper_application_data_executor_access;

COMMIT;
