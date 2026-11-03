-- Explicit role-catalogue delegation eligibility; fail closed by default.
BEGIN;

ALTER TABLE eper_workflow_role_definition
  ADD COLUMN IF NOT EXISTS delegable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN eper_workflow_role_definition.delegable IS
  'Explicit approval for Customer Admin delegation; false by default.';

COMMIT;
