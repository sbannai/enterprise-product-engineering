-- Mutable, version-checked application-scoped workflow drafts.
-- Published immutable definitions remain in eper_workflow_definition_versions.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_workflow_definition_drafts (
  tenant_id varchar(128) NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  application_id varchar(128) NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  workflow_id varchar(128) NOT NULL CHECK (length(btrim(workflow_id)) BETWEEN 1 AND 128),
  draft_version bigint NOT NULL CHECK (draft_version > 0),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  change_reason varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(128) NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 128),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(128) NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, application_id, workflow_id),
  FOREIGN KEY (tenant_id, application_id)
    REFERENCES eper_tenant_application_assignment (tenant_id, application_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS eper_workflow_definition_drafts_updated_idx
  ON eper_workflow_definition_drafts (tenant_id, application_id, updated_at DESC);

ALTER TABLE eper_workflow_definition_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_workflow_definition_drafts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_application_isolation ON eper_workflow_definition_drafts;
CREATE POLICY tenant_application_isolation
  ON eper_workflow_definition_drafts
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

COMMIT;
