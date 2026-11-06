-- Explicit role scope metadata. Tenant-wide roles remain unavailable until a
-- separately reviewed cross-application authorization path is implemented.
BEGIN;

ALTER TABLE eper_workflow_role_definition
  ADD COLUMN IF NOT EXISTS scope_type text NOT NULL DEFAULT 'application';

ALTER TABLE eper_workflow_role_definition
  ADD CONSTRAINT eper_workflow_role_definition_scope_type_check
  CHECK (scope_type IN ('application'));

COMMENT ON COLUMN eper_workflow_role_definition.scope_type IS
  'Authorization scope for the role. Application is the only supported scope; tenant-wide grants fail closed.';

COMMIT;
