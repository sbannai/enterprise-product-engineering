-- Persist the exact boundary after which provider dispatch may begin.
ALTER TABLE eper_campaign_executions
  ADD COLUMN IF NOT EXISTS dispatch_started_at timestamptz;

CREATE INDEX IF NOT EXISTS eper_campaign_executions_dispatch_started_idx
  ON eper_campaign_executions (tenant_id, application_id, schedule_id)
  WHERE status='running' AND dispatch_started_at IS NOT NULL;
