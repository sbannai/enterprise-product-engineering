-- Durable, application-scoped workflow role membership.
-- Local development and integration tests only; no cloud resources are provisioned.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_workflow_actor_role_assignment (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  actor_id varchar(128) NOT NULL,
  role_id varchar(128) NOT NULL,
  assignment_status varchar(16) NOT NULL DEFAULT 'active'
    CHECK (assignment_status IN ('active','revoked')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by varchar(128) NOT NULL,
  revoked_at timestamptz,
  revoked_by varchar(128),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(128) NOT NULL,
  PRIMARY KEY (tenant_id, application_id, actor_id, role_id),
  FOREIGN KEY (tenant_id, application_id)
    REFERENCES eper_tenant_application_assignment (tenant_id, application_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_id, application_id)
    REFERENCES eper_actor_application_assignment (tenant_id, actor_id, application_id)
    ON DELETE RESTRICT,
  CHECK (
    (assignment_status = 'active' AND revoked_at IS NULL AND revoked_by IS NULL)
    OR (assignment_status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS eper_workflow_actor_role_active_idx
  ON eper_workflow_actor_role_assignment
    (tenant_id, application_id, actor_id, role_id)
  WHERE assignment_status = 'active';

CREATE INDEX IF NOT EXISTS eper_workflow_role_actor_active_idx
  ON eper_workflow_actor_role_assignment
    (tenant_id, application_id, role_id, actor_id)
  WHERE assignment_status = 'active';

ALTER TABLE eper_workflow_actor_role_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_workflow_actor_role_assignment FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_application_isolation
  ON eper_workflow_actor_role_assignment;
CREATE POLICY tenant_application_isolation
  ON eper_workflow_actor_role_assignment
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

COMMIT;
