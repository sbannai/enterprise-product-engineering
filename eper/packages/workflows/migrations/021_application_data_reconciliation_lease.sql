-- Durable, independently fenced reconciliation lease for successful application-data writes.
-- The business mutation may live in PostgreSQL, MongoDB, or a local adapter;
-- this lease allows workflow advancement to recover after a process crash.
BEGIN;

ALTER TABLE eper_workflow_application_data_intents
  ADD COLUMN IF NOT EXISTS reconciliation_status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (reconciliation_status IN ('pending','processing','completed')),
  ADD COLUMN IF NOT EXISTS reconciliation_attempts integer NOT NULL DEFAULT 0
    CHECK (reconciliation_attempts >= 0),
  ADD COLUMN IF NOT EXISTS reconciliation_available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reconciliation_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_locked_by varchar(128),
  ADD COLUMN IF NOT EXISTS reconciliation_claim_generation bigint NOT NULL DEFAULT 0
    CHECK (reconciliation_claim_generation >= 0);

ALTER TABLE eper_workflow_application_data_intents
  DROP CONSTRAINT IF EXISTS eper_workflow_app_data_reconciliation_lease_check;

ALTER TABLE eper_workflow_application_data_intents
  ADD CONSTRAINT eper_workflow_app_data_reconciliation_lease_check
  CHECK (
    (reconciliation_status = 'processing'
      AND reconciliation_locked_at IS NOT NULL
      AND reconciliation_locked_by IS NOT NULL)
    OR
    (reconciliation_status <> 'processing'
      AND reconciliation_locked_at IS NULL
      AND reconciliation_locked_by IS NULL)
  );

ALTER TABLE eper_workflow_application_data_intents
  DROP CONSTRAINT IF EXISTS eper_workflow_app_data_reconciliation_state_check;

ALTER TABLE eper_workflow_application_data_intents
  ADD CONSTRAINT eper_workflow_app_data_reconciliation_state_check
  CHECK (
    (intent_status IN ('pending','processing','failed','dead_letter')
      AND reconciliation_status = 'pending')
    OR
    (intent_status = 'succeeded'
      AND reconciliation_status IN ('pending','processing'))
    OR
    (intent_status = 'advanced'
      AND reconciliation_status = 'completed')
  );

CREATE INDEX IF NOT EXISTS eper_workflow_app_data_reconciliation_claim_idx
  ON eper_workflow_application_data_intents
    (tenant_id, application_id, reconciliation_available_at, completed_at)
  WHERE intent_status = 'succeeded'
    AND reconciliation_status IN ('pending','processing');

COMMIT;
