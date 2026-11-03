-- Durable, tenant-scoped provider credential validation history.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_provider_validation_events (
  validation_event_id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  connection_id UUID NOT NULL,
  provider_key TEXT NOT NULL,
  expected_connection_version BIGINT NOT NULL CHECK (expected_connection_version > 0),
  resulting_connection_version BIGINT NOT NULL CHECK (resulting_connection_version > 0),
  validation_outcome TEXT NOT NULL CHECK (validation_outcome IN ('SUCCEEDED', 'FAILED')),
  error_code TEXT CHECK (error_code IS NULL OR error_code ~ '^[A-Z0-9_]{1,64}$'),
  actor_id TEXT NOT NULL CHECK (length(btrim(actor_id)) BETWEEN 1 AND 128),
  correlation_id TEXT NOT NULL CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 128),
  audit_environment TEXT NOT NULL CHECK (audit_environment IN ('production', 'uat', 'sandbox')),
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, connection_id, provider_key)
    REFERENCES eper_provider_connections (tenant_id, connection_id, provider_key),
  CHECK (
    (validation_outcome = 'SUCCEEDED' AND error_code IS NULL)
    OR (validation_outcome = 'FAILED' AND error_code IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS eper_provider_validation_events_scope_idx
  ON eper_provider_validation_events (tenant_id, connection_id, validated_at DESC);

ALTER TABLE eper_provider_validation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_provider_validation_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_provider_validation_events_tenant_scope
  ON eper_provider_validation_events;
CREATE POLICY eper_provider_validation_events_tenant_scope
  ON eper_provider_validation_events
  USING (tenant_id = current_setting('eper.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('eper.tenant_id', true));

COMMIT;
