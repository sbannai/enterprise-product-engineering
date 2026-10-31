-- Durable, tenant/application-scoped approval and side-effect execution ledger.
-- Local development and integration-test migration only. No cloud resources or dispatchers.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_action_proposals (
  tenant_id varchar(128) NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  application_id varchar(128) NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  proposal_id varchar(128) NOT NULL CHECK (length(btrim(proposal_id)) BETWEEN 1 AND 128),
  proposal_version integer NOT NULL CHECK (proposal_version > 0),
  action_type varchar(128) NOT NULL CHECK (length(btrim(action_type)) BETWEEN 1 AND 128),
  side_effect_class varchar(32) NOT NULL CHECK (side_effect_class IN (
    'crm_mutation','external_communication','publish','audience_export',
    'financial_commitment','other_external_action'
  )),
  target_type varchar(128) NOT NULL CHECK (length(btrim(target_type)) BETWEEN 1 AND 128),
  target_id varchar(256) NOT NULL CHECK (length(btrim(target_id)) BETWEEN 1 AND 256),
  requested_by varchar(128) NOT NULL CHECK (length(btrim(requested_by)) BETWEEN 1 AND 128),
  requester_type varchar(16) NOT NULL CHECK (requester_type IN ('human','service','system')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key varchar(128) NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 16 AND 128),
  correlation_id varchar(128) NOT NULL CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, proposal_id, proposal_version),
  UNIQUE (tenant_id, application_id, proposal_id, proposal_version, payload_hash),
  UNIQUE (tenant_id, application_id, idempotency_key),
  UNIQUE (tenant_id, application_id, proposal_id, proposal_version, idempotency_key),
  CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS eper_action_approval_grants (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  approval_id varchar(128) NOT NULL CHECK (length(btrim(approval_id)) BETWEEN 1 AND 128),
  proposal_id varchar(128) NOT NULL,
  proposal_version integer NOT NULL CHECK (proposal_version > 0),
  proposal_hash char(64) NOT NULL CHECK (proposal_hash ~ '^[a-f0-9]{64}$'),
  requested_by varchar(128) NOT NULL,
  approver_id varchar(128) NOT NULL CHECK (length(btrim(approver_id)) BETWEEN 1 AND 128),
  approver_type varchar(16) NOT NULL CHECK (approver_type = 'human'),
  decided_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  policy_version varchar(64) NOT NULL CHECK (length(btrim(policy_version)) BETWEEN 1 AND 64),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, approval_id),
  UNIQUE (tenant_id, application_id, approval_id, proposal_id, proposal_version, proposal_hash),
  FOREIGN KEY (tenant_id, application_id, proposal_id, proposal_version, proposal_hash)
    REFERENCES eper_action_proposals (tenant_id, application_id, proposal_id, proposal_version, payload_hash)
    ON DELETE RESTRICT,
  CHECK (approver_id <> requested_by),
  CHECK (expires_at > decided_at)
);

CREATE TABLE IF NOT EXISTS eper_action_approval_decisions (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  decision_id uuid NOT NULL,
  proposal_id varchar(128) NOT NULL,
  proposal_version integer NOT NULL CHECK (proposal_version > 0),
  proposal_hash char(64) NOT NULL CHECK (proposal_hash ~ '^[a-f0-9]{64}$'),
  approval_id varchar(128),
  decision varchar(16) NOT NULL CHECK (decision IN ('approve','reject','revoke')),
  actor_id varchar(128) NOT NULL CHECK (length(btrim(actor_id)) BETWEEN 1 AND 128),
  actor_type varchar(16) NOT NULL CHECK (actor_type IN ('human','service','system')),
  decided_at timestamptz NOT NULL,
  expires_at timestamptz,
  policy_version varchar(64) NOT NULL CHECK (length(btrim(policy_version)) BETWEEN 1 AND 64),
  reason_code varchar(128),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, decision_id),
  FOREIGN KEY (tenant_id, application_id, proposal_id, proposal_version, proposal_hash)
    REFERENCES eper_action_proposals (tenant_id, application_id, proposal_id, proposal_version, payload_hash)
    ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, application_id, approval_id, proposal_id, proposal_version, proposal_hash)
    REFERENCES eper_action_approval_grants
      (tenant_id, application_id, approval_id, proposal_id, proposal_version, proposal_hash)
    ON DELETE RESTRICT,
  CHECK (
    (decision = 'reject' AND approval_id IS NULL AND expires_at IS NULL)
    OR (decision = 'approve' AND approval_id IS NOT NULL AND actor_type = 'human' AND expires_at IS NOT NULL)
    OR (decision = 'revoke' AND approval_id IS NOT NULL AND actor_type = 'human' AND expires_at IS NULL)
  ),
  UNIQUE (tenant_id, application_id, approval_id, decision)
);

CREATE TABLE IF NOT EXISTS eper_action_execution_claims (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  execution_id uuid NOT NULL,
  proposal_id varchar(128) NOT NULL,
  proposal_version integer NOT NULL CHECK (proposal_version > 0),
  proposal_hash char(64) NOT NULL CHECK (proposal_hash ~ '^[a-f0-9]{64}$'),
  approval_id varchar(128) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  execution_status varchar(16) NOT NULL CHECK (execution_status IN ('processing','succeeded','failed')),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  worker_id varchar(128) NOT NULL CHECK (length(btrim(worker_id)) BETWEEN 1 AND 128),
  lease_expires_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  result_hash char(64) CHECK (result_hash IS NULL OR result_hash ~ '^[a-f0-9]{64}$'),
  last_error_code varchar(128),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, execution_id),
  UNIQUE (tenant_id, application_id, approval_id),
  UNIQUE (tenant_id, application_id, idempotency_key),
  FOREIGN KEY (tenant_id, application_id, approval_id, proposal_id, proposal_version, proposal_hash)
    REFERENCES eper_action_approval_grants
      (tenant_id, application_id, approval_id, proposal_id, proposal_version, proposal_hash)
    ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, application_id, proposal_id, proposal_version, idempotency_key)
    REFERENCES eper_action_proposals
      (tenant_id, application_id, proposal_id, proposal_version, idempotency_key)
    ON DELETE RESTRICT,
  CHECK (
    (execution_status = 'processing' AND lease_expires_at IS NOT NULL AND finished_at IS NULL)
    OR (execution_status IN ('succeeded','failed') AND lease_expires_at IS NULL AND finished_at IS NOT NULL)
  ),
  CHECK (execution_status <> 'succeeded' OR result_hash IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS eper_action_execution_recovery_idx
  ON eper_action_execution_claims (tenant_id, application_id, lease_expires_at, execution_id)
  WHERE execution_status = 'processing';

CREATE TABLE IF NOT EXISTS eper_action_execution_events (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  event_id uuid NOT NULL,
  execution_id uuid NOT NULL,
  approval_id varchar(128) NOT NULL,
  event_type varchar(24) NOT NULL CHECK (event_type IN (
    'claimed','lease_renewed','succeeded','failed','reclaimed'
  )),
  worker_id varchar(128) NOT NULL CHECK (length(btrim(worker_id)) BETWEEN 1 AND 128),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (tenant_id, application_id, event_id),
  FOREIGN KEY (tenant_id, application_id, execution_id)
    REFERENCES eper_action_execution_claims (tenant_id, application_id, execution_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, application_id, approval_id)
    REFERENCES eper_action_approval_grants (tenant_id, application_id, approval_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS eper_action_approval_history_idx
  ON eper_action_approval_decisions (tenant_id, application_id, proposal_id, proposal_version, decided_at, decision_id);
CREATE INDEX IF NOT EXISTS eper_action_execution_events_history_idx
  ON eper_action_execution_events (tenant_id, application_id, execution_id, occurred_at, event_id);

CREATE OR REPLACE FUNCTION eper_reject_action_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'EPER_ACTION_LEDGER_APPEND_ONLY'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;

CREATE OR REPLACE FUNCTION eper_guard_action_execution_claim_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.application_id IS DISTINCT FROM OLD.application_id
    OR NEW.execution_id IS DISTINCT FROM OLD.execution_id
    OR NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
    OR NEW.proposal_version IS DISTINCT FROM OLD.proposal_version
    OR NEW.proposal_hash IS DISTINCT FROM OLD.proposal_hash
    OR NEW.approval_id IS DISTINCT FROM OLD.approval_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'EPER_ACTION_EXECUTION_IDENTITY_IMMUTABLE'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.execution_status = 'succeeded' THEN
    RAISE EXCEPTION 'EPER_ACTION_EXECUTION_ALREADY_SUCCEEDED'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.attempt_count < OLD.attempt_count THEN
    RAISE EXCEPTION 'EPER_ACTION_EXECUTION_ATTEMPTS_NOT_MONOTONIC'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'eper_action_proposals',
    'eper_action_approval_grants',
    'eper_action_approval_decisions',
    'eper_action_execution_claims',
    'eper_action_execution_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_application_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_application_isolation ON %I USING (tenant_id = current_setting(''eper.tenant_id'', true) AND application_id = current_setting(''eper.application_id'', true)) WITH CHECK (tenant_id = current_setting(''eper.tenant_id'', true) AND application_id = current_setting(''eper.application_id'', true))',
      table_name
    );
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS eper_action_proposals_no_update ON eper_action_proposals;
CREATE TRIGGER eper_action_proposals_no_update
BEFORE UPDATE OR DELETE ON eper_action_proposals
FOR EACH ROW EXECUTE FUNCTION eper_reject_action_ledger_mutation();
DROP TRIGGER IF EXISTS eper_action_proposals_no_truncate ON eper_action_proposals;
CREATE TRIGGER eper_action_proposals_no_truncate
BEFORE TRUNCATE ON eper_action_proposals
FOR EACH STATEMENT EXECUTE FUNCTION eper_reject_action_ledger_mutation();

DROP TRIGGER IF EXISTS eper_action_approval_grants_no_update ON eper_action_approval_grants;
CREATE TRIGGER eper_action_approval_grants_no_update
BEFORE UPDATE OR DELETE ON eper_action_approval_grants
FOR EACH ROW EXECUTE FUNCTION eper_reject_action_ledger_mutation();
DROP TRIGGER IF EXISTS eper_action_approval_grants_no_truncate ON eper_action_approval_grants;
CREATE TRIGGER eper_action_approval_grants_no_truncate
BEFORE TRUNCATE ON eper_action_approval_grants
FOR EACH STATEMENT EXECUTE FUNCTION eper_reject_action_ledger_mutation();

DROP TRIGGER IF EXISTS eper_action_approval_decisions_no_update ON eper_action_approval_decisions;
CREATE TRIGGER eper_action_approval_decisions_no_update
BEFORE UPDATE OR DELETE ON eper_action_approval_decisions
FOR EACH ROW EXECUTE FUNCTION eper_reject_action_ledger_mutation();
DROP TRIGGER IF EXISTS eper_action_approval_decisions_no_truncate ON eper_action_approval_decisions;
CREATE TRIGGER eper_action_approval_decisions_no_truncate
BEFORE TRUNCATE ON eper_action_approval_decisions
FOR EACH STATEMENT EXECUTE FUNCTION eper_reject_action_ledger_mutation();

DROP TRIGGER IF EXISTS eper_action_execution_claims_guard_update ON eper_action_execution_claims;
CREATE TRIGGER eper_action_execution_claims_guard_update
BEFORE UPDATE ON eper_action_execution_claims
FOR EACH ROW EXECUTE FUNCTION eper_guard_action_execution_claim_update();
DROP TRIGGER IF EXISTS eper_action_execution_claims_no_delete ON eper_action_execution_claims;
CREATE TRIGGER eper_action_execution_claims_no_delete
BEFORE DELETE ON eper_action_execution_claims
FOR EACH ROW EXECUTE FUNCTION eper_reject_action_ledger_mutation();
DROP TRIGGER IF EXISTS eper_action_execution_claims_no_truncate ON eper_action_execution_claims;
CREATE TRIGGER eper_action_execution_claims_no_truncate
BEFORE TRUNCATE ON eper_action_execution_claims
FOR EACH STATEMENT EXECUTE FUNCTION eper_reject_action_ledger_mutation();

DROP TRIGGER IF EXISTS eper_action_execution_events_no_update ON eper_action_execution_events;
CREATE TRIGGER eper_action_execution_events_no_update
BEFORE UPDATE OR DELETE ON eper_action_execution_events
FOR EACH ROW EXECUTE FUNCTION eper_reject_action_ledger_mutation();
DROP TRIGGER IF EXISTS eper_action_execution_events_no_truncate ON eper_action_execution_events;
CREATE TRIGGER eper_action_execution_events_no_truncate
BEFORE TRUNCATE ON eper_action_execution_events
FOR EACH STATEMENT EXECUTE FUNCTION eper_reject_action_ledger_mutation();

COMMIT;
