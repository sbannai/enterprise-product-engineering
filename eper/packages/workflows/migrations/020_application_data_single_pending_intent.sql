-- At most one unreconciled application-data activity may hold a workflow instance.
-- An intent remains active until the workflow state machine durably advances it.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS eper_workflow_application_data_one_unadvanced_intent_idx
  ON eper_workflow_application_data_intents (tenant_id, application_id, instance_id)
  WHERE intent_status <> 'advanced';

COMMIT;
