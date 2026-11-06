-- Make customer asset upload reservations retryable without deleting history.
-- Idempotency is scoped to an application; only one live upload may reserve an
-- asset in that application. Terminal attempts remain immutable and queryable.
BEGIN;

ALTER TABLE eper_customer_asset_upload_sessions
  DROP CONSTRAINT IF EXISTS eper_customer_asset_upload_sessions_tenant_id_asset_id_key;
ALTER TABLE eper_customer_asset_upload_sessions
  DROP CONSTRAINT IF EXISTS eper_customer_asset_upload_sessions_tenant_id_idempotency_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS eper_customer_asset_upload_application_idempotency_uq
  ON eper_customer_asset_upload_sessions (tenant_id, application_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS eper_customer_asset_upload_active_asset_uq
  ON eper_customer_asset_upload_sessions (tenant_id, asset_id)
  WHERE upload_status IN ('reserved', 'initiated', 'in_progress');

DROP INDEX IF EXISTS eper_customer_asset_upload_expiry_idx;
CREATE INDEX eper_customer_asset_upload_expiry_idx
  ON eper_customer_asset_upload_sessions (expires_at, tenant_id, application_id)
  WHERE upload_status IN ('reserved', 'initiated', 'in_progress');

COMMIT;
