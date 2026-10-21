-- Store the exact issued PDF bytes alongside their immutable digest.
-- This makes subsequent downloads byte-for-byte stable instead of regenerating a new artifact.
BEGIN;

ALTER TABLE eper_payment_receipts
  ADD COLUMN IF NOT EXISTS document_pdf BYTEA;

ALTER TABLE eper_payment_receipts
  ADD CONSTRAINT eper_payment_receipts_document_hash_pair_check
  CHECK (
    (document_pdf IS NULL AND document_sha256 IS NULL) OR
    (document_pdf IS NOT NULL AND document_sha256 IS NOT NULL)
  );

COMMIT;
