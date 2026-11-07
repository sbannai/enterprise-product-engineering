-- Monotonic claim fencing token prevents a stale worker from acknowledging a takeover.
-- Existing rows start at generation zero; the first successful claim increments to one.
BEGIN;

ALTER TABLE eper_workflow_outbox_delivery
  ADD COLUMN IF NOT EXISTS claim_generation bigint NOT NULL DEFAULT 0;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'eper_workflow_outbox_claim_generation_nonnegative'
       AND conrelid = 'public.eper_workflow_outbox_delivery'::regclass
  ) THEN
    ALTER TABLE eper_workflow_outbox_delivery
      ADD CONSTRAINT eper_workflow_outbox_claim_generation_nonnegative
      CHECK (claim_generation >= 0);
  END IF;
END
$constraints$;

-- The worker increments the token atomically while claiming; all acknowledgements
-- and lease renewals compare against the generation returned by that claim.
GRANT UPDATE (claim_generation)
  ON eper_workflow_outbox_delivery
  TO eper_workflow_outbox_worker_access;

COMMIT;
