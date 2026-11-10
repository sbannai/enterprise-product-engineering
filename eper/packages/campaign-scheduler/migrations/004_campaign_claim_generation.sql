-- Give every successful scheduler claim a monotonically increasing ownership generation.
-- The generation is scoped to the durable execution row and survives lease recovery.
ALTER TABLE eper_campaign_executions
  ADD COLUMN IF NOT EXISTS claim_generation bigint NOT NULL DEFAULT 0;

ALTER TABLE eper_campaign_executions
  ADD CONSTRAINT eper_campaign_execution_claim_generation_nonnegative
  CHECK (claim_generation >= 0);

COMMENT ON COLUMN eper_campaign_executions.claim_generation IS
  'Monotonically increasing lease ownership generation; all worker mutations must match the claimed generation.';
