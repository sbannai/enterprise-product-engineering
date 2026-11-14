-- Durable intent ledger for the workflow-to-application-data hand-off.
-- Transition-time enqueue and the waiting state are implemented by the workflow
-- execution service. A separate completion/reconciliation transaction is still
-- required before a succeeded intent can safely advance its workflow instance.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_workflow_application_data_intents (
  tenant_id varchar(128) NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  application_id varchar(128) NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  intent_id uuid NOT NULL,
  instance_id uuid NOT NULL,
  activity_execution_id uuid NOT NULL,
  activity_id varchar(128) NOT NULL CHECK (length(btrim(activity_id)) BETWEEN 1 AND 128),
  actor_id varchar(128) NOT NULL CHECK (length(btrim(actor_id)) BETWEEN 1 AND 128),
  correlation_id varchar(128) NOT NULL CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 128),
  requirement_id varchar(128) NOT NULL CHECK (length(btrim(requirement_id)) BETWEEN 1 AND 128),
  idempotency_key varchar(128) NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 16 AND 128),
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  entity_type varchar(128) NOT NULL CHECK (entity_type ~ '^[a-zA-Z][a-zA-Z0-9._-]{1,127}$'),
  operation varchar(16) NOT NULL CHECK (operation IN ('create','update','delete')),
  binding jsonb NOT NULL CHECK (jsonb_typeof(binding) = 'object'),
  input jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  intent_status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (intent_status IN ('pending','processing','succeeded','failed','dead_letter','advanced')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by varchar(128),
  claim_generation bigint NOT NULL DEFAULT 0 CHECK (claim_generation >= 0),
  result jsonb CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  last_error varchar(2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, application_id, intent_id),
  UNIQUE (tenant_id, application_id, idempotency_key),
  UNIQUE (tenant_id, application_id, instance_id, activity_execution_id),
  FOREIGN KEY (tenant_id, application_id, instance_id)
    REFERENCES eper_workflow_instances (tenant_id, application_id, instance_id)
    ON DELETE RESTRICT,
  CHECK (
    (intent_status = 'processing' AND locked_at IS NOT NULL AND locked_by IS NOT NULL)
    OR (intent_status <> 'processing' AND locked_at IS NULL AND locked_by IS NULL)
  ),
  CHECK (
    (intent_status IN ('succeeded','failed','dead_letter','advanced') AND completed_at IS NOT NULL)
    OR (intent_status IN ('pending','processing') AND completed_at IS NULL)
  ),
  CHECK ((intent_status IN ('succeeded','advanced') AND result IS NOT NULL) OR intent_status NOT IN ('succeeded','advanced'))
);

CREATE INDEX IF NOT EXISTS eper_workflow_app_data_intents_claim_idx
  ON eper_workflow_application_data_intents (tenant_id, application_id, available_at, created_at)
  WHERE intent_status IN ('pending','processing');

CREATE INDEX IF NOT EXISTS eper_workflow_app_data_intents_instance_idx
  ON eper_workflow_application_data_intents (tenant_id, application_id, instance_id, created_at);

ALTER TABLE eper_workflow_application_data_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_workflow_application_data_intents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_application_isolation ON eper_workflow_application_data_intents;
CREATE POLICY tenant_application_isolation
  ON eper_workflow_application_data_intents
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

COMMIT;
