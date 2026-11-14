-- Bound poison-intent retries and preserve the failure reason without blocking other instances.
BEGIN;
ALTER TABLE eper_workflow_application_data_intents
  DROP CONSTRAINT IF EXISTS eper_workflow_app_data_reconciliation_state_check;
ALTER TABLE eper_workflow_application_data_intents
  DROP CONSTRAINT IF EXISTS eper_workflow_application_data_intents_reconciliation_status_check;
ALTER TABLE eper_workflow_application_data_intents
  ADD CONSTRAINT eper_workflow_app_data_reconciliation_status_check
  CHECK (reconciliation_status IN ('pending','processing','completed','dead_letter'));
ALTER TABLE eper_workflow_application_data_intents
  ADD CONSTRAINT eper_workflow_app_data_reconciliation_state_check
  CHECK (
    (intent_status IN ('pending','processing','failed','dead_letter')
      AND reconciliation_status = 'pending')
    OR (intent_status = 'succeeded'
      AND reconciliation_status IN ('pending','processing','dead_letter'))
    OR (intent_status = 'advanced' AND reconciliation_status = 'completed')
  );
CREATE INDEX IF NOT EXISTS eper_workflow_app_data_reconciliation_dead_letter_idx
  ON eper_workflow_application_data_intents (tenant_id, application_id, updated_at)
  WHERE intent_status = 'succeeded' AND reconciliation_status = 'dead_letter';
COMMIT;
