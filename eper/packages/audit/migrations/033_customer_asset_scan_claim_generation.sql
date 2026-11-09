-- Monotonic fencing token for every customer-asset scan claim/takeover.
-- Existing jobs begin at generation zero; the first claim increments to one.
-- A stale worker must not mutate a newer claim; the current worker must present
-- the exact generation returned by its claim for every
-- lease renewal, scan-input lookup, retry and result-finalization mutation.
BEGIN;

ALTER TABLE eper_customer_asset_scan_jobs
  ADD COLUMN IF NOT EXISTS claim_generation bigint NOT NULL DEFAULT 0;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'eper_customer_asset_scan_claim_generation_nonnegative'
       AND conrelid = 'public.eper_customer_asset_scan_jobs'::regclass
  ) THEN
    ALTER TABLE eper_customer_asset_scan_jobs
      ADD CONSTRAINT eper_customer_asset_scan_claim_generation_nonnegative
      CHECK (claim_generation >= 0);
  END IF;
END
$constraints$;

COMMENT ON COLUMN eper_customer_asset_scan_jobs.claim_generation IS
  'Monotonic claim fencing token; incremented on every successful lease claim or takeover.';

COMMIT;
