-- Durable campaign schedules and execution ledger. Apply only through the approved migration workflow.
CREATE TABLE IF NOT EXISTS eper_campaign_schedules (
  id uuid PRIMARY KEY,
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  campaign_id varchar(128) NOT NULL,
  trigger_type varchar(24) NOT NULL CHECK (trigger_type IN ('once','recurring','event','condition')),
  timezone varchar(128) NOT NULL,
  schedule_definition jsonb NOT NULL,
  approval_status varchar(24) NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  status varchar(24) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','paused','cancelled','completed')),
  next_run_at timestamptz,
  created_by varchar(128) NOT NULL,
  updated_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eper_campaign_schedule_tenant_app_id_unique UNIQUE (tenant_id, application_id, id),
  CONSTRAINT eper_campaign_schedule_due_state CHECK (
    (status = 'scheduled' AND next_run_at IS NOT NULL AND approval_status = 'approved')
    OR status <> 'scheduled'
  )
);
CREATE INDEX IF NOT EXISTS eper_campaign_schedules_due_idx
  ON eper_campaign_schedules (next_run_at, created_at)
  WHERE status = 'scheduled' AND approval_status = 'approved';
CREATE INDEX IF NOT EXISTS eper_campaign_schedules_tenant_app_idx
  ON eper_campaign_schedules (tenant_id, application_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS eper_campaign_executions (
  id uuid PRIMARY KEY,
  schedule_id uuid NOT NULL REFERENCES eper_campaign_schedules(id),
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','retry_wait','dead_letter','cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  idempotency_key varchar(256) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  last_error_code varchar(64),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by varchar(128),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eper_campaign_execution_idempotency_unique UNIQUE (tenant_id, application_id, idempotency_key),
  CONSTRAINT eper_campaign_execution_tenant_schedule_fk
    FOREIGN KEY (tenant_id, application_id, schedule_id)
    REFERENCES eper_campaign_schedules (tenant_id, application_id, id)
);
CREATE INDEX IF NOT EXISTS eper_campaign_executions_claim_idx
  ON eper_campaign_executions (available_at, created_at)
  WHERE status IN ('queued','retry_wait');
CREATE INDEX IF NOT EXISTS eper_campaign_executions_schedule_history_idx
  ON eper_campaign_executions (tenant_id, application_id, schedule_id, created_at DESC);
