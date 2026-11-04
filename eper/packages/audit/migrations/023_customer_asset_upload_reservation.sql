-- Reserve upload idempotency before issuing provider capabilities.
-- Existing sessions retain their initiated/completed lifecycle.
BEGIN;

ALTER TABLE eper_customer_asset_upload_sessions
  DROP CONSTRAINT IF EXISTS eper_customer_asset_upload_sessions_upload_status_check;
ALTER TABLE eper_customer_asset_upload_sessions
  ADD CONSTRAINT eper_customer_asset_upload_sessions_upload_status_check
  CHECK (upload_status IN ('reserved', 'initiated', 'in_progress', 'completed', 'aborted', 'expired', 'failed'));

-- provider_upload_reference is already nullable in migration 021. A reserved
-- row intentionally has no provider reference and cannot pass verification.
CREATE INDEX IF NOT EXISTS eper_customer_asset_upload_reservations_idx
  ON eper_customer_asset_upload_sessions (tenant_id, application_id, created_at)
  WHERE upload_status = 'reserved';

COMMIT;
