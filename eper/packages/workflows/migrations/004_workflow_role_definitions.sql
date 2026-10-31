-- Application-scoped workflow role catalogue and permission grants.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_workflow_role_definition (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  role_id varchar(128) NOT NULL,
  name varchar(200) NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  description varchar(2000),
  permissions jsonb NOT NULL CHECK (
    jsonb_typeof(permissions) = 'array'
    AND jsonb_array_length(permissions) BETWEEN 1 AND 6
  ),
  role_status varchar(16) NOT NULL DEFAULT 'active'
    CHECK (role_status IN ('active','disabled')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(128) NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 128),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(128) NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, application_id, role_id),
  FOREIGN KEY (tenant_id, application_id)
    REFERENCES eper_tenant_application_assignment (tenant_id, application_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS eper_workflow_role_definition_active_idx
  ON eper_workflow_role_definition (tenant_id, application_id, role_id)
  WHERE role_status = 'active';

ALTER TABLE eper_workflow_role_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_workflow_role_definition FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_application_isolation ON eper_workflow_role_definition;
CREATE POLICY tenant_application_isolation
  ON eper_workflow_role_definition
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'eper_workflow_actor_role_assignment_role_fk'
       AND conrelid = 'eper_workflow_actor_role_assignment'::regclass
  ) THEN
    ALTER TABLE eper_workflow_actor_role_assignment
      ADD CONSTRAINT eper_workflow_actor_role_assignment_role_fk
      FOREIGN KEY (tenant_id, application_id, role_id)
      REFERENCES eper_workflow_role_definition (tenant_id, application_id, role_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

COMMIT;
