-- Immutable upload attempt generations, request fingerprints and safe retries.
-- A new attempt is permitted only after the previous active attempt is terminal.
BEGIN;

ALTER TABLE eper_customer_asset_upload_sessions
  ADD COLUMN IF NOT EXISTS attempt_generation integer,
  ADD COLUMN IF NOT EXISTS request_fingerprint jsonb;

WITH ranked AS (
  SELECT tenant_id, upload_session_id,
         row_number() OVER (
           PARTITION BY tenant_id, asset_id
           ORDER BY created_at, upload_session_id
         )::integer AS generation
    FROM eper_customer_asset_upload_sessions
   WHERE attempt_generation IS NULL
)
UPDATE eper_customer_asset_upload_sessions s
   SET attempt_generation = ranked.generation,
       request_fingerprint = jsonb_build_object(
         'version', 1,
         'tenantId', s.tenant_id,
         'applicationId', s.application_id,
         'actorId', s.actor_id,
         'assetId', s.asset_id::text,
         'expectedSizeBytes', s.expected_size_bytes
       )
  FROM ranked
 WHERE ranked.tenant_id = s.tenant_id
   AND ranked.upload_session_id = s.upload_session_id;

ALTER TABLE eper_customer_asset_upload_sessions
  ALTER COLUMN attempt_generation SET NOT NULL,
  ALTER COLUMN request_fingerprint SET NOT NULL;

ALTER TABLE eper_customer_asset_upload_sessions
  DROP CONSTRAINT IF EXISTS eper_customer_asset_upload_sessions_tenant_id_asset_id_key;

ALTER TABLE eper_customer_asset_upload_sessions
  ADD CONSTRAINT eper_customer_asset_upload_attempt_generation_positive
    CHECK (attempt_generation > 0),
  ADD CONSTRAINT eper_customer_asset_upload_request_fingerprint_object
    CHECK (jsonb_typeof(request_fingerprint) = 'object');

CREATE UNIQUE INDEX IF NOT EXISTS eper_customer_asset_upload_attempt_generation_uq
  ON eper_customer_asset_upload_sessions (tenant_id, asset_id, attempt_generation);

-- Only one reservation/transfer may be active for an asset. Completed and
-- failed/expired/aborted attempts remain immutable history.
UPDATE eper_customer_asset_upload_sessions
   SET upload_status = 'expired', updated_at = clock_timestamp()
 WHERE upload_status IN ('reserved', 'initiated', 'in_progress')
   AND expires_at <= clock_timestamp();

CREATE UNIQUE INDEX IF NOT EXISTS eper_customer_asset_upload_one_active_attempt_uq
  ON eper_customer_asset_upload_sessions (tenant_id, asset_id)
  WHERE upload_status IN ('reserved', 'initiated', 'in_progress');

CREATE OR REPLACE FUNCTION eper_customer_asset_upload_attempt_identity_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.application_id IS DISTINCT FROM OLD.application_id
     OR NEW.upload_session_id IS DISTINCT FROM OLD.upload_session_id
     OR NEW.asset_id IS DISTINCT FROM OLD.asset_id
     OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
     OR NEW.expected_size_bytes IS DISTINCT FROM OLD.expected_size_bytes
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.attempt_generation IS DISTINCT FROM OLD.attempt_generation
     OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_UPLOAD_ATTEMPT_IDENTITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS eper_customer_asset_upload_attempt_identity_immutable_trg
  ON eper_customer_asset_upload_sessions;
CREATE TRIGGER eper_customer_asset_upload_attempt_identity_immutable_trg
BEFORE UPDATE ON eper_customer_asset_upload_sessions
FOR EACH ROW EXECUTE FUNCTION eper_customer_asset_upload_attempt_identity_immutable();

CREATE INDEX IF NOT EXISTS eper_customer_asset_upload_attempt_history_idx
  ON eper_customer_asset_upload_sessions (tenant_id, asset_id, attempt_generation DESC);

COMMIT;
