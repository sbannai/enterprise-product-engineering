-- Durable, auditable classification of provider-side upload outcomes.
-- Legacy rows with a persisted provider reference are known successes. Every
-- other legacy row remains unknown; historical failure status is not proof of
-- a definitive provider rejection.
BEGIN;

ALTER TABLE eper_customer_asset_upload_sessions
  ADD COLUMN IF NOT EXISTS provider_outcome varchar(16) NOT NULL DEFAULT 'unknown';

UPDATE eper_customer_asset_upload_sessions
   SET provider_outcome = 'succeeded'
 WHERE provider_upload_reference IS NOT NULL
   AND provider_outcome = 'unknown';

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'eper_customer_asset_upload_provider_outcome_values'
       AND conrelid = 'eper_customer_asset_upload_sessions'::regclass
  ) THEN
    ALTER TABLE eper_customer_asset_upload_sessions
      ADD CONSTRAINT eper_customer_asset_upload_provider_outcome_values
      CHECK (provider_outcome IN ('unknown', 'succeeded', 'rejected'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'eper_customer_asset_upload_provider_success_reference'
       AND conrelid = 'eper_customer_asset_upload_sessions'::regclass
  ) THEN
    ALTER TABLE eper_customer_asset_upload_sessions
      ADD CONSTRAINT eper_customer_asset_upload_provider_success_reference
      CHECK (provider_outcome <> 'succeeded' OR provider_upload_reference IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'eper_customer_asset_upload_provider_rejection_reference'
       AND conrelid = 'eper_customer_asset_upload_sessions'::regclass
  ) THEN
    ALTER TABLE eper_customer_asset_upload_sessions
      ADD CONSTRAINT eper_customer_asset_upload_provider_rejection_reference
      CHECK (provider_outcome <> 'rejected' OR provider_upload_reference IS NULL);
  END IF;
END
$constraints$;

CREATE INDEX IF NOT EXISTS eper_customer_asset_upload_provider_outcome_idx
  ON eper_customer_asset_upload_sessions
    (tenant_id, application_id, provider_outcome, updated_at DESC);

COMMENT ON COLUMN eper_customer_asset_upload_sessions.provider_outcome IS
  'Provider-side result classification. Legacy rows without a persisted provider reference remain unknown; failed upload status is not evidence of definitive provider rejection.';

COMMIT;
