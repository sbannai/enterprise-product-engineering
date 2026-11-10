-- Additive lifecycle metadata for encrypted provider payloads.
-- Existing v1 envelopes remain untouched: key_id is NULL and the v1 AAD is unchanged.
-- NULL expires_at deliberately means "not eligible for automated purge".
BEGIN;

ALTER TABLE eper_provider_payloads
  ADD COLUMN IF NOT EXISTS key_id TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS retention_policy_id TEXT,
  ADD COLUMN IF NOT EXISTS retention_policy_version TEXT;

ALTER TABLE eper_provider_payloads
  ADD CONSTRAINT eper_provider_payloads_key_id_shape
  CHECK (key_id IS NULL OR length(btrim(key_id)) BETWEEN 1 AND 128);

ALTER TABLE eper_provider_payloads
  ADD CONSTRAINT eper_provider_payloads_retention_policy_pair
  CHECK (
    (retention_policy_id IS NULL AND retention_policy_version IS NULL)
    OR
    (retention_policy_id IS NOT NULL
      AND retention_policy_version IS NOT NULL
      AND length(btrim(retention_policy_id)) BETWEEN 1 AND 128
      AND length(btrim(retention_policy_version)) BETWEEN 1 AND 64)
  );

CREATE INDEX IF NOT EXISTS eper_provider_payloads_expiry_idx
  ON eper_provider_payloads (expires_at, tenant_id, application_id)
  WHERE expires_at IS NOT NULL AND legal_hold = FALSE;

COMMENT ON COLUMN eper_provider_payloads.key_id IS
  'Non-secret keyring identifier for versioned envelopes; NULL for legacy envelope v1.';
COMMENT ON COLUMN eper_provider_payloads.expires_at IS
  'Explicit policy-resolved expiry. NULL means no automated purge eligibility.';
COMMENT ON COLUMN eper_provider_payloads.legal_hold IS
  'When true, payload is excluded from all automated purge operations.';
COMMENT ON COLUMN eper_provider_payloads.retention_policy_id IS
  'Identifier of the explicit retention policy resolved for this payload; NULL when unresolved.';
COMMENT ON COLUMN eper_provider_payloads.retention_policy_version IS
  'Immutable version of the retention policy resolved for this payload.';

COMMIT;
