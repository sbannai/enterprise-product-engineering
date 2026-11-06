-- Add a monotonic per-delivery claim generation for stale-worker fencing.
-- Every successful claim increments the value; retries never reset it.
BEGIN;

ALTER TABLE eper_workflow_outbox_delivery
  ADD COLUMN IF NOT EXISTS claim_version bigint NOT NULL DEFAULT 0
  CHECK (claim_version >= 0);

GRANT UPDATE (claim_version)
  ON eper_workflow_outbox_delivery
  TO eper_workflow_outbox_worker_access;

COMMIT;
