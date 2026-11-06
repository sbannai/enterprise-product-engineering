-- Public, immutable identifiers for transactions and issued/downloadable receipts.
-- Internal BIGSERIAL keys remain available for joins; external identifiers are UUIDs.
BEGIN;

ALTER TABLE eper_payment_orders
  ADD COLUMN IF NOT EXISTS transaction_public_id UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE eper_payment_receipts
  ADD COLUMN IF NOT EXISTS receipt_public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS eper_payment_orders_transaction_public_id_uidx
  ON eper_payment_orders (transaction_public_id);

CREATE UNIQUE INDEX IF NOT EXISTS eper_payment_receipts_receipt_public_id_uidx
  ON eper_payment_receipts (receipt_public_id);

COMMIT;
