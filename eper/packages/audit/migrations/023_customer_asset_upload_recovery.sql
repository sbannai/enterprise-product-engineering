-- Durable recovery metadata for idempotent customer-asset upload reservations.
-- No signed URLs, provider credentials, or bearer tokens are persisted here.
-- The service computes the canonical SHA-256 request fingerprint and supplies it
-- on reservation creation; retries must compare it before any grant is reissued.
BEGIN;

ALTER TABLE eper_customer_asset_upload_sessions
  ADD COLUMN IF NOT EXISTS request_fingerprint char(64),
  ADD COLUMN IF NOT EXISTS provider_grant_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_recovered_at timestamptz;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'eper_customer_asset_upload_request_fingerprint_format'
       AND conrelid = 'eper_customer_asset_upload_sessions'::regclass
  ) THEN
    ALTER TABLE eper_customer_asset_upload_sessions
      ADD CONSTRAINT eper_customer_asset_upload_request_fingerprint_format
      CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[a-f0-9]{64}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'eper_customer_asset_upload_grant_expiry_requires_reference'
       AND conrelid = 'eper_customer_asset_upload_sessions'::regclass
  ) THEN
    ALTER TABLE eper_customer_asset_upload_sessions
      ADD CONSTRAINT eper_customer_asset_upload_grant_expiry_requires_reference
      CHECK (provider_grant_expires_at IS NULL OR provider_upload_reference IS NOT NULL);
  END IF;
END
$constraints$;

CREATE INDEX IF NOT EXISTS eper_customer_asset_upload_recovery_idx
  ON eper_customer_asset_upload_sessions
    (tenant_id, application_id, actor_id, idempotency_key, updated_at DESC);

COMMENT ON COLUMN eper_customer_asset_upload_sessions.request_fingerprint IS
  'SHA-256 of canonical immutable request identity: tenant, application, actor, asset, filename, MIME type, expected size and checksum; never a credential.';
COMMENT ON COLUMN eper_customer_asset_upload_sessions.provider_grant_expires_at IS
  'Expiry of the provider upload capability; persist expiry metadata only, never the signed URL or token.';
COMMENT ON COLUMN eper_customer_asset_upload_sessions.last_recovered_at IS
  'Timestamp of the last authorized recovery attempt; does not imply a new upload session or reset scan state.';

COMMIT;
