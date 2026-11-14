-- Explicit workflow hold state for an application-data activity.
-- The pointer binds the waiting instance to one immutable activity execution,
-- including when a workflow loops back to the same activity ID.
BEGIN;

ALTER TABLE eper_workflow_instances
  ADD COLUMN IF NOT EXISTS pending_activity_execution_id uuid;

ALTER TABLE eper_workflow_instances
  DROP CONSTRAINT IF EXISTS eper_workflow_instances_status_check;

ALTER TABLE eper_workflow_instances
  ADD CONSTRAINT eper_workflow_instances_status_check
  CHECK (status IN ('running','waiting_for_data','completed','rejected','cancelled','failed'));

ALTER TABLE eper_workflow_instances
  DROP CONSTRAINT IF EXISTS eper_workflow_instances_completion_state_check;

ALTER TABLE eper_workflow_instances
  ADD CONSTRAINT eper_workflow_instances_completion_state_check
  CHECK (
    (status IN ('running','waiting_for_data') AND current_activity_id IS NOT NULL AND completed_at IS NULL)
    OR (status IN ('completed','rejected','cancelled','failed') AND current_activity_id IS NULL AND completed_at IS NOT NULL)
  );

ALTER TABLE eper_workflow_instances
  DROP CONSTRAINT IF EXISTS eper_workflow_instances_pending_data_state_check;

ALTER TABLE eper_workflow_instances
  ADD CONSTRAINT eper_workflow_instances_pending_data_state_check
  CHECK (
    (status = 'waiting_for_data' AND pending_activity_execution_id IS NOT NULL)
    OR (status <> 'waiting_for_data' AND pending_activity_execution_id IS NULL)
  );

ALTER TABLE eper_workflow_instances
  DROP CONSTRAINT IF EXISTS eper_workflow_instances_pending_data_intent_fk;

ALTER TABLE eper_workflow_instances
  ADD CONSTRAINT eper_workflow_instances_pending_data_intent_fk
  FOREIGN KEY (tenant_id, application_id, instance_id, pending_activity_execution_id)
  REFERENCES eper_workflow_application_data_intents
    (tenant_id, application_id, instance_id, activity_execution_id)
  DEFERRABLE INITIALLY DEFERRED;

COMMIT;
