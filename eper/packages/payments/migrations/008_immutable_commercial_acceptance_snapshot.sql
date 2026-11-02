-- Persist the exact accepted customer tariff snapshot with the payment order and receipt.
-- Nullable for historical records; new commercially gated orders must populate it.
BEGIN;

ALTER TABLE eper_payment_orders
  ADD COLUMN IF NOT EXISTS commercial_acceptance_snapshot JSONB;
ALTER TABLE eper_payment_receipts
  ADD COLUMN IF NOT EXISTS commercial_acceptance_snapshot JSONB;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'eper_payment_orders_commercial_acceptance_object_check'
       AND conrelid = 'eper_payment_orders'::regclass
  ) THEN
    ALTER TABLE eper_payment_orders
      ADD CONSTRAINT eper_payment_orders_commercial_acceptance_object_check
      CHECK (commercial_acceptance_snapshot IS NULL OR jsonb_typeof(commercial_acceptance_snapshot) = 'object');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'eper_payment_receipts_commercial_acceptance_object_check'
       AND conrelid = 'eper_payment_receipts'::regclass
  ) THEN
    ALTER TABLE eper_payment_receipts
      ADD CONSTRAINT eper_payment_receipts_commercial_acceptance_object_check
      CHECK (commercial_acceptance_snapshot IS NULL OR jsonb_typeof(commercial_acceptance_snapshot) = 'object');
  END IF;
END
$migration$;

CREATE OR REPLACE FUNCTION eper_guard_payment_order_snapshot_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.transaction_snapshot IS DISTINCT FROM OLD.transaction_snapshot
     OR NEW.commercial_acceptance_snapshot IS DISTINCT FROM OLD.commercial_acceptance_snapshot THEN
    RAISE EXCEPTION 'EPER_PAYMENT_ORDER_SNAPSHOT_IMMUTABLE'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$function$;

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
  IF NEW.transaction_snapshot IS DISTINCT FROM OLD.transaction_snapshot
     OR NEW.commercial_acceptance_snapshot IS DISTINCT FROM OLD.commercial_acceptance_snapshot THEN
    RAISE EXCEPTION 'EPER_PAYMENT_RECEIPT_SNAPSHOT_IMMUTABLE'
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

COMMIT;
