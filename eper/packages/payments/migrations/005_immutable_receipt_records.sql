-- Enforce receipt identity and issued-document immutability in PostgreSQL itself.
-- The first transition from an empty document pair to persisted PDF bytes is allowed.
-- Once present, receipt identity, numbering, issue timestamp, PDF bytes, and digest cannot change.
BEGIN;

CREATE OR REPLACE FUNCTION eper_guard_payment_receipt_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.payment_order_id IS DISTINCT FROM OLD.payment_order_id
     OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
     OR NEW.receipt_public_id IS DISTINCT FROM OLD.receipt_public_id
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN
    RAISE EXCEPTION 'EPER_PAYMENT_RECEIPT_IDENTITY_IMMUTABLE'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF (OLD.document_pdf IS NOT NULL OR OLD.document_sha256 IS NOT NULL)
     AND (NEW.document_pdf IS DISTINCT FROM OLD.document_pdf
          OR NEW.document_sha256 IS DISTINCT FROM OLD.document_sha256) THEN
    RAISE EXCEPTION 'EPER_PAYMENT_RECEIPT_DOCUMENT_IMMUTABLE'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS eper_payment_receipt_immutability_guard ON eper_payment_receipts;
CREATE TRIGGER eper_payment_receipt_immutability_guard
BEFORE UPDATE ON eper_payment_receipts
FOR EACH ROW
EXECUTE FUNCTION eper_guard_payment_receipt_immutability();

COMMIT;
