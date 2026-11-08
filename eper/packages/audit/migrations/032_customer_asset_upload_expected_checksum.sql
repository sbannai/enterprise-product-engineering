-- Persist the client-provided SHA-256 as an integrity expectation for each upload.
-- Nullable by design for legacy rows; the API refuses completion when it is absent.
BEGIN;

ALTER TABLE public.eper_customer_asset_upload_sessions
  ADD COLUMN IF NOT EXISTS expected_checksum_sha256 char(64);

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'eper_customer_asset_upload_expected_checksum_sha256_format'
       AND conrelid = 'public.eper_customer_asset_upload_sessions'::regclass
  ) THEN
    ALTER TABLE public.eper_customer_asset_upload_sessions
      ADD CONSTRAINT eper_customer_asset_upload_expected_checksum_sha256_format
      CHECK (expected_checksum_sha256 IS NULL OR expected_checksum_sha256 ~ '^[a-f0-9]{64}$');
  END IF;
END
$constraints$;

COMMENT ON COLUMN public.eper_customer_asset_upload_sessions.expected_checksum_sha256 IS
  'Client-supplied SHA-256 integrity expectation, validated at initiation and compared to provider-observed SHA-256 before completion. NULL is legacy-only and fails closed at completion; this is not malware-scan evidence.';

COMMIT;
