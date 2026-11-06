-- Opaque encrypted-payload handoff reference for durable provider dispatch.
-- Historical operations remain NULL; all new enqueue calls require a reference.
BEGIN;

ALTER TABLE eper_provider_operations
  ADD COLUMN IF NOT EXISTS payload_reference TEXT;

ALTER TABLE eper_provider_operations
  ADD CONSTRAINT eper_provider_operations_payload_reference_format
  CHECK (
    payload_reference IS NULL
    OR payload_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'
  );

CREATE INDEX IF NOT EXISTS eper_provider_operations_payload_reference_idx
  ON eper_provider_operations (tenant_id, application_id, payload_reference)
  WHERE payload_reference IS NOT NULL;

COMMENT ON COLUMN eper_provider_operations.payload_reference IS
  'Opaque reference to encrypted payload in an independently authorized tenant/application-scoped payload store; never raw payload or credentials. NULL only for historical rows.';

COMMIT;
