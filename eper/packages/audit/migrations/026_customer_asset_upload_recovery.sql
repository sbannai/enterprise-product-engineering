-- Durable request identity and provider-outcome classification for customer asset uploads.
-- This is additive: applied migrations remain immutable. Legacy sessions retain a
-- NULL fingerprint and must fail closed for replay because their original request
-- dimensions cannot be reconstructed reliably.
BEGIN;

ALTER TABLE eper_customer_asset_upload_sessions
  ADD COLUMN IF NOT EXISTS request_fingerprint varchar(64),
  ADD COLUMN IF NOT EXISTS request_file_name varchar(255),
  ADD COLUMN IF NOT EXISTS request_mime_type varchar(128),
  ADD COLUMN IF NOT EXISTS provider_outcome varchar(16) NOT NULL DEFAULT 'unknown';

-- Existing initiated/in-progress/completed sessions already have a persisted
-- provider reference. Do not infer that legacy failed rows were definitive rejects:
-- earlier service code collapsed timeouts and persistence errors into "failed".
UPDATE eper_customer_asset_upload_sessions
   SET provider_outcome = 'succeeded'
 WHERE upload_status IN ('initiated', 'in_progress', 'completed')
   AND provider_upload_reference IS NOT NULL
   AND provider_outcome = 'unknown';

ALTER TABLE eper_customer_asset_upload_sessions
  DROP CONSTRAINT IF EXISTS eper_customer_asset_upload_sessions_request_fingerprint_check,
  ADD CONSTRAINT eper_customer_asset_upload_sessions_request_fingerprint_check
    CHECK (
      request_fingerprint IS NULL
      OR (
        request_fingerprint ~ '^[a-f0-9]{64}$'
        AND request_file_name IS NOT NULL
        AND length(btrim(request_file_name)) BETWEEN 1 AND 255
        AND request_mime_type IS NOT NULL
        AND length(btrim(request_mime_type)) BETWEEN 1 AND 128
      )
    ),
  DROP CONSTRAINT IF EXISTS eper_customer_asset_upload_sessions_provider_outcome_check,
  ADD CONSTRAINT eper_customer_asset_upload_sessions_provider_outcome_check
    CHECK (provider_outcome IN ('unknown', 'succeeded', 'rejected'));

COMMENT ON COLUMN eper_customer_asset_upload_sessions.request_fingerprint IS
  'SHA-256 of canonical tenant/application/actor/asset/size/normalized filename/MIME/provider policy. NULL denotes legacy identity and must fail closed.';
COMMENT ON COLUMN eper_customer_asset_upload_sessions.request_file_name IS
  'Normalized client filename bound to request_fingerprint; never used as a storage path.';
COMMENT ON COLUMN eper_customer_asset_upload_sessions.request_mime_type IS
  'Normalized MIME type bound to request_fingerprint.';
COMMENT ON COLUMN eper_customer_asset_upload_sessions.provider_outcome IS
  'Provider result classification. unknown is recoverable and must not be treated as rejection; provider references remain server-only.';

CREATE INDEX IF NOT EXISTS eper_customer_asset_upload_recovery_idx
  ON eper_customer_asset_upload_sessions (tenant_id, application_id, updated_at)
  WHERE upload_status = 'reserved' AND provider_outcome = 'unknown';

COMMIT;
