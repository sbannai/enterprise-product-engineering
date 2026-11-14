-- Preserve the authorizing workflow role and permission with the durable intent.
-- The executor revalidates these grants before touching application records.
BEGIN;
ALTER TABLE eper_workflow_application_data_intents
  ADD COLUMN IF NOT EXISTS actor_role_id varchar(128),
  ADD COLUMN IF NOT EXISTS required_permission varchar(32);
ALTER TABLE eper_workflow_application_data_intents
  ADD CONSTRAINT eper_workflow_application_data_intent_authorization_check
  CHECK (
    (actor_role_id IS NULL AND required_permission IS NULL)
    OR (actor_role_id IS NOT NULL AND length(btrim(actor_role_id)) BETWEEN 1 AND 128
        AND required_permission IS NOT NULL\n        AND required_permission IN ('workflow:act','workflow:approve'))
  );
COMMIT;
