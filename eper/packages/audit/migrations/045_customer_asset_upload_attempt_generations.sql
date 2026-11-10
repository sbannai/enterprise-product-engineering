-- Monotonic immutable generation number for each asset upload attempt.
-- The existing session row remains the durable attempt record; this adds an
-- ordered generation without changing the established retry/active-session rules.
BEGIN;

ALTER TABLE eper_customer_asset_upload_sessions
  ADD COLUMN IF NOT EXISTS attempt_generation bigint;

WITH ranked AS (
  SELECT tenant_id, asset_id, upload_session_id,
         row_number() OVER (
           PARTITION BY tenant_id, asset_id
           ORDER BY created_at, upload_session_id
         )::bigint AS generation
    FROM eper_customer_asset_upload_sessions
   WHERE attempt_generation IS NULL
)
UPDATE eper_customer_asset_upload_sessions AS s
   SET attempt_generation = ranked.generation
  FROM ranked
 WHERE ranked.tenant_id = s.tenant_id
   AND ranked.asset_id = s.asset_id
   AND ranked.upload_session_id = s.upload_session_id;

ALTER TABLE eper_customer_asset_upload_sessions
  ALTER COLUMN attempt_generation SET NOT NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'eper_customer_asset_upload_attempt_generation_positive'
       AND conrelid = 'public.eper_customer_asset_upload_sessions'::regclass
  ) THEN
    ALTER TABLE eper_customer_asset_upload_sessions
      ADD CONSTRAINT eper_customer_asset_upload_attempt_generation_positive
      CHECK (attempt_generation > 0);
  END IF;
END
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS eper_customer_asset_upload_attempt_generation_uq
  ON eper_customer_asset_upload_sessions (tenant_id, asset_id, attempt_generation);

CREATE OR REPLACE FUNCTION public.eper_customer_asset_upload_attempt_identity_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.application_id IS DISTINCT FROM OLD.application_id
     OR NEW.upload_session_id IS DISTINCT FROM OLD.upload_session_id
     OR NEW.asset_id IS DISTINCT FROM OLD.asset_id
     OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
     OR NEW.expected_size_bytes IS DISTINCT FROM OLD.expected_size_bytes
     OR NEW.expected_checksum_sha256 IS DISTINCT FROM OLD.expected_checksum_sha256
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
     OR NEW.attempt_generation IS DISTINCT FROM OLD.attempt_generation THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_UPLOAD_ATTEMPT_IDENTITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS eper_customer_asset_upload_attempt_identity_immutable_trg
  ON eper_customer_asset_upload_sessions;
CREATE TRIGGER eper_customer_asset_upload_attempt_identity_immutable_trg
BEFORE UPDATE ON eper_customer_asset_upload_sessions
FOR EACH ROW
EXECUTE FUNCTION public.eper_customer_asset_upload_attempt_identity_immutable();

COMMENT ON COLUMN eper_customer_asset_upload_sessions.attempt_generation IS
  'Monotonic per-asset upload attempt number. Immutable across the attempt lifecycle; terminal attempts remain in history.';

COMMIT;
