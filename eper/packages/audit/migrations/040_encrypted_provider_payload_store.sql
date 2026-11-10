-- Durable encrypted provider request payloads.
-- The application encrypts with a host-injected key; PostgreSQL stores ciphertext only.
-- Payload rows are scoped by tenant + application and are not credentials or provider responses.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_provider_payloads (
  payload_reference TEXT NOT NULL
    CHECK (payload_reference ~ '^pp_[a-f0-9-]{36}$'),
  tenant_id TEXT NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  application_id TEXT NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  operation_id TEXT NOT NULL CHECK (length(btrim(operation_id)) BETWEEN 1 AND 200),
  capability_key TEXT NOT NULL CHECK (length(btrim(capability_key)) BETWEEN 1 AND 128),
  payload_digest TEXT NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
  envelope_version SMALLINT NOT NULL CHECK (envelope_version = 1),
  nonce TEXT NOT NULL CHECK (length(nonce) BETWEEN 16 AND 64),
  auth_tag TEXT NOT NULL CHECK (length(auth_tag) BETWEEN 16 AND 64),
  ciphertext TEXT NOT NULL CHECK (length(ciphertext) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (payload_reference),
  UNIQUE (tenant_id, application_id, payload_reference),
  UNIQUE (tenant_id, application_id, operation_id)
);

CREATE INDEX IF NOT EXISTS eper_provider_payloads_operation_idx
  ON eper_provider_payloads (tenant_id, application_id, operation_id, created_at);

ALTER TABLE eper_provider_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_provider_payloads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_provider_payloads_application_scope ON eper_provider_payloads;
CREATE POLICY eper_provider_payloads_application_scope ON eper_provider_payloads
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

GRANT SELECT, INSERT, DELETE ON eper_provider_payloads TO eper_provider_catalogue_access;
REVOKE UPDATE, TRUNCATE, REFERENCES, TRIGGER ON eper_provider_payloads
  FROM eper_provider_catalogue_access;

COMMENT ON TABLE eper_provider_payloads IS
  'Tenant/application-scoped AES-256-GCM envelopes for provider operation payloads; never store plaintext or key material.';
COMMENT ON COLUMN eper_provider_payloads.payload_reference IS
  'Opaque identifier referenced by eper_provider_operations.payload_reference.';
COMMENT ON COLUMN eper_provider_payloads.ciphertext IS
  'Base64-encoded AES-256-GCM ciphertext only; encryption key remains host-managed.';

COMMIT;
