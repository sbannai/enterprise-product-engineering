-- Persist the validated order-time transaction snapshot for webhook/capture retries.
-- Legacy orders may remain NULL, but new checkout reservations must include an object.
BEGIN;

ALTER TABLE eper_payment_orders
  ADD COLUMN IF NOT EXISTS transaction_snapshot JSONB;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'eper_payment_orders_transaction_snapshot_object_check'
       AND conrelid = 'eper_payment_orders'::regclass
  ) THEN
    ALTER TABLE eper_payment_orders
      ADD CONSTRAINT eper_payment_orders_transaction_snapshot_object_check
      CHECK (
        transaction_snapshot IS NULL OR jsonb_typeof(transaction_snapshot) = 'object'
      );
  END IF;
END
$migration$;

CREATE OR REPLACE FUNCTION eper_guard_payment_order_snapshot_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.transaction_snapshot IS DISTINCT FROM OLD.transaction_snapshot THEN
    RAISE EXCEPTION 'EPER_PAYMENT_ORDER_SNAPSHOT_IMMUTABLE'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS eper_payment_order_snapshot_immutable ON eper_payment_orders;
CREATE TRIGGER eper_payment_order_snapshot_immutable
BEFORE UPDATE ON eper_payment_orders
FOR EACH ROW
EXECUTE FUNCTION eper_guard_payment_order_snapshot_immutability();

COMMIT;
