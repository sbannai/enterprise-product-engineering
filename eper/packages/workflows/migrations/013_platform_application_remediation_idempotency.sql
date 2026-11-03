-- Separate idempotency ledger for one-application Product Admin remediation.
-- Kept separate from Customer Admin provision/recovery authority and ledger.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_platform_application_remediation_idempotency (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  idempotency_key varchar(200) NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  platform_actor_id varchar(128) NOT NULL,
  credential_id varchar(128) NOT NULL,
  expected_assignment_version bigint NOT NULL CHECK (expected_assignment_version > 0),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, application_id, idempotency_key),
  FOREIGN KEY (tenant_id, application_id)
    REFERENCES eper_tenant_application_assignment (tenant_id, application_id)
    ON DELETE RESTRICT,
  CHECK ((completed_at IS NULL AND result IS NULL) OR (completed_at IS NOT NULL AND result IS NOT NULL))
);

ALTER TABLE eper_platform_application_remediation_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_platform_application_remediation_idempotency FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_application_isolation
  ON eper_platform_application_remediation_idempotency;
CREATE POLICY tenant_application_isolation
  ON eper_platform_application_remediation_idempotency
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

COMMENT ON TABLE eper_platform_application_remediation_idempotency IS
  'Idempotency ledger for independently authorized single-application suspension; mutation and audit commit atomically.';

COMMIT;
