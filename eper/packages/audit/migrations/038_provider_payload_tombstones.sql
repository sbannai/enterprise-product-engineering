-- Preserve immutable operation-to-payload identity after retention deletion.
-- Ciphertext and per-envelope nonce/tag are scrubbed; reference, digest, scope,
-- envelope version, key id, retention policy and operation FK remain durable.
BEGIN;

ALTER TABLE eper_provider_payloads
  ALTER COLUMN nonce DROP NOT NULL,
  ALTER COLUMN auth_tag DROP NOT NULL,
  ALTER COLUMN ciphertext DROP NOT NULL;

ALTER TABLE eper_provider_payloads
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_actor_type TEXT,
  ADD COLUMN IF NOT EXISTS deleted_by_actor_id TEXT,
  ADD COLUMN IF NOT EXISTS deletion_source TEXT,
  ADD COLUMN IF NOT EXISTS deletion_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS deletion_policy_decision_reference TEXT,
  ADD COLUMN IF NOT EXISTS deletion_correlation_id TEXT;

ALTER TABLE eper_provider_payloads
  ADD CONSTRAINT eper_provider_payloads_tombstone_shape
  CHECK (
    (
      deleted_at IS NULL
      AND nonce IS NOT NULL AND auth_tag IS NOT NULL AND ciphertext IS NOT NULL
      AND deleted_by_actor_type IS NULL AND deleted_by_actor_id IS NULL
      AND deletion_source IS NULL AND deletion_reason_code IS NULL
      AND deletion_policy_decision_reference IS NULL AND deletion_correlation_id IS NULL
    )
    OR
    (
      deleted_at IS NOT NULL
      AND nonce IS NULL AND auth_tag IS NULL AND ciphertext IS NULL
      AND deleted_by_actor_type IS NOT NULL AND length(btrim(deleted_by_actor_type)) BETWEEN 1 AND 32
      AND deleted_by_actor_id IS NOT NULL AND length(btrim(deleted_by_actor_id)) BETWEEN 1 AND 128
      AND deletion_source IS NOT NULL AND length(btrim(deletion_source)) BETWEEN 1 AND 128
      AND deletion_reason_code IS NOT NULL AND length(btrim(deletion_reason_code)) BETWEEN 1 AND 96
      AND deletion_policy_decision_reference IS NOT NULL
        AND length(btrim(deletion_policy_decision_reference)) BETWEEN 1 AND 256
      AND deletion_correlation_id IS NOT NULL AND length(btrim(deletion_correlation_id)) BETWEEN 1 AND 128
    )
  );

CREATE INDEX IF NOT EXISTS eper_provider_payloads_live_expiry_idx
  ON eper_provider_payloads (expires_at, tenant_id, application_id)
  WHERE deleted_at IS NULL AND expires_at IS NOT NULL AND legal_hold = FALSE;

COMMENT ON COLUMN eper_provider_payloads.deleted_at IS
  'Tombstone timestamp; immutable reference, digest and operation relationship remain after ciphertext scrubbing.';

COMMIT;
