-- Store the exact issued PDF bytes alongside their immutable digest.
-- This makes subsequent downloads byte-for-byte stable instead of regenerating a new artifact.
-- Constraint creation is idempotent so a rerun after partial deployment is safe.
BEGIN;

ALTER TABLE eper_payment_receipts
  ADD COLUMN IF NOT EXISTS document_pdf BYTEA;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'eper_payment_receipts_document_hash_pair_check'
       AND conrelid = 'eper_payment_receipts'::regclass
  ) THEN
    ALTER TABLE eper_payment_receipts
      ADD CONSTRAINT eper_payment_receipts_document_hash_pair_check
      CHECK (
        (document_pdf IS NULL AND document_sha256 IS NULL) OR
        (document_pdf IS NOT NULL AND document_sha256 IS NOT NULL)
      );
  END IF;
END
$migration$;

COMMIT;
