-- Recoverable provider-operation leases with monotonic fencing generations.
-- Expired dispatch claims can be reclaimed; stale workers cannot record outcomes.
BEGIN;

ALTER TABLE eper_provider_operations
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fencing_token BIGINT NOT NULL DEFAULT 0
    CHECK (fencing_token >= 0);

CREATE INDEX IF NOT EXISTS eper_provider_operations_expired_lease_idx
  ON eper_provider_operations (tenant_id, application_id, lease_expires_at, available_at)
  WHERE operation_status = 'DISPATCHING';

COMMENT ON COLUMN eper_provider_operations.lease_owner IS
  'Current worker identity for a DISPATCHING operation; cleared on outcome.';
COMMENT ON COLUMN eper_provider_operations.lease_expires_at IS
  'Lease expiry in database time; expired DISPATCHING rows may be reclaimed.';
COMMENT ON COLUMN eper_provider_operations.fencing_token IS
  'Monotonically increasing claim generation; every worker outcome must present the current token and owner.';

COMMIT;
