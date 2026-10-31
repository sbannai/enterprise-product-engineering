-- Preserve the specific worker failure diagnostic separately from the safe
-- dispatch-outcome classification. A crossed dispatch fence must remain
-- DISPATCH_OUTCOME_UNKNOWN so no scheduler path can mistake it for retryable.
ALTER TABLE eper_campaign_executions
  ADD COLUMN IF NOT EXISTS last_error_detail_code varchar(64);
