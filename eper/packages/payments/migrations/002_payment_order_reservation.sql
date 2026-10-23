-- Safely reserve a tenant-scoped idempotency key before making a remote Razorpay call.
-- Existing rows retain their current status; this migration adds an explicit creation state.
BEGIN;

ALTER TABLE eper_payment_orders
  DROP CONSTRAINT IF EXISTS eper_payment_orders_status_check;

ALTER TABLE eper_payment_orders
  ADD CONSTRAINT eper_payment_orders_status_check
  CHECK (status IN ('creating', 'created', 'authorized', 'captured', 'failed', 'refunded'));

ALTER TABLE eper_payment_orders
  ADD COLUMN IF NOT EXISTS creation_lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS creation_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_creation_error TEXT;

CREATE INDEX IF NOT EXISTS eper_payment_orders_creation_lease_idx
  ON eper_payment_orders (creation_lease_until)
  WHERE status = 'creating';

COMMIT;
