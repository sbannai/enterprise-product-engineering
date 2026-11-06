-- Idempotent start-request identity for durable workflow instance creation.
BEGIN;

ALTER TABLE eper_workflow_instances
  ADD COLUMN IF NOT EXISTS start_idempotency_key varchar(128),
  ADD COLUMN IF NOT EXISTS start_request_fingerprint char(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'eper_workflow_instances_start_idempotency_pair_check'
       AND conrelid = 'eper_workflow_instances'::regclass
  ) THEN
    ALTER TABLE eper_workflow_instances
      ADD CONSTRAINT eper_workflow_instances_start_idempotency_pair_check
      CHECK (
        (start_idempotency_key IS NULL AND start_request_fingerprint IS NULL)
        OR
        (start_idempotency_key IS NOT NULL
         AND length(btrim(start_idempotency_key)) BETWEEN 16 AND 128
         AND start_request_fingerprint ~ '^[a-f0-9]{64}$')
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS eper_workflow_instances_start_idempotency_idx
  ON eper_workflow_instances (tenant_id, application_id, start_idempotency_key)
  WHERE start_idempotency_key IS NOT NULL;

COMMIT;
