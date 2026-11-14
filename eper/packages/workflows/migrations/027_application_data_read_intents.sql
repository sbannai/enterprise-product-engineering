-- Extend governed workflow application-data intents to support read-only operations.
-- Existing migration files remain immutable; this forward migration updates the constraint.
BEGIN;

ALTER TABLE eper_workflow_application_data_intents
  DROP CONSTRAINT IF EXISTS eper_workflow_application_data_intents_operation_check;

ALTER TABLE eper_workflow_application_data_intents
  ADD CONSTRAINT eper_workflow_application_data_intents_operation_check
  CHECK (operation IN ('create','get','update','delete','query'));

COMMIT;
