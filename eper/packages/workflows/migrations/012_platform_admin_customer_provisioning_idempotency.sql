-- Idempotency ledger for trusted platform Customer Admin provision/recovery.
-- Rows remain tenant/application scoped; mutations and audit are committed atomically.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_platform_admin_operation_idempotency (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  operation varchar(32) NOT NULL CHECK (operation IN ('provision','recover')),
  idempotency_key varchar(200) NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  platform_actor_id varchar(128) NOT NULL,
  credential_id varchar(128) NOT NULL,
  target_actor_id varchar(128) NOT NULL,
  assignment_version bigint,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, application_id, operation, idempotency_key),
  FOREIGN KEY (tenant_id, application_id)
    REFERENCES eper_tenant_application_assignment (tenant_id, application_id)
    ON DELETE RESTRICT,
  CHECK (
    (completed_at IS NULL AND result IS NULL AND assignment_version IS NULL)
    OR (completed_at IS NOT NULL AND result IS NOT NULL AND assignment_version IS NOT NULL)
  )
);

ALTER TABLE eper_platform_admin_operation_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_platform_admin_operation_idempotency FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_application_isolation
  ON eper_platform_admin_operation_idempotency;
CREATE POLICY tenant_application_isolation
  ON eper_platform_admin_operation_idempotency
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

COMMENT ON TABLE eper_platform_admin_operation_idempotency IS
  'Idempotency ledger for platform-admin first Customer Admin provisioning and lockout recovery; same transaction as assignment and audit.';

COMMIT;
