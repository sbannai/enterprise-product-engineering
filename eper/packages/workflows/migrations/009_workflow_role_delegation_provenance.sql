-- Delegation policy hardening for application-scoped workflow role assignments.
-- Delegation is enforced by PostgresWorkflowRoleDelegationStore; no cloud resources.
BEGIN;

-- Preserve grant provenance explicitly. Existing assigned_by remains the actor
-- who performed the most recent grant; grantor_actor_id is retained as
-- historical grant provenance after revocation for audit and assignment history.
ALTER TABLE eper_workflow_actor_role_assignment
  ADD COLUMN IF NOT EXISTS grantor_actor_id varchar(128);

UPDATE eper_workflow_actor_role_assignment
   SET grantor_actor_id = assigned_by
 WHERE grantor_actor_id IS NULL
   AND assignment_status = 'active';

CREATE INDEX IF NOT EXISTS eper_workflow_role_grantor_active_idx
  ON eper_workflow_actor_role_assignment
    (tenant_id, application_id, grantor_actor_id, actor_id, role_id)
  WHERE assignment_status = 'active';

COMMIT;
