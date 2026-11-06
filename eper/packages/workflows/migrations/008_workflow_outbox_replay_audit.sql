-- Audited, tenant/application-scoped dead-letter replay history.
-- Replay reuses the immutable original event_id; dispatchers must deduplicate by event_id.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_workflow_outbox_replay_audit (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  replay_id uuid NOT NULL,
  event_id uuid NOT NULL,
  actor_id varchar(128) NOT NULL CHECK (length(btrim(actor_id)) BETWEEN 1 AND 128),
  reason varchar(2000) NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
  idempotency_key varchar(128) NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 16 AND 128),
  prior_attempts integer NOT NULL CHECK (prior_attempts >= 0),
  prior_last_error varchar(2000),
  replayed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, application_id, replay_id),
  UNIQUE (tenant_id, application_id, idempotency_key),
  FOREIGN KEY (tenant_id, application_id, event_id)
    REFERENCES eper_workflow_outbox_delivery (tenant_id, application_id, event_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS eper_workflow_outbox_replay_event_idx
  ON eper_workflow_outbox_replay_audit (tenant_id, application_id, event_id, replayed_at DESC);

CREATE OR REPLACE FUNCTION eper_reject_workflow_outbox_replay_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'EPER_WORKFLOW_OUTBOX_REPLAY_AUDIT_APPEND_ONLY'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;

DROP TRIGGER IF EXISTS eper_workflow_outbox_replay_audit_no_update ON eper_workflow_outbox_replay_audit;
CREATE TRIGGER eper_workflow_outbox_replay_audit_no_update
  BEFORE UPDATE ON eper_workflow_outbox_replay_audit
  FOR EACH ROW EXECUTE FUNCTION eper_reject_workflow_outbox_replay_audit_mutation();

DROP TRIGGER IF EXISTS eper_workflow_outbox_replay_audit_no_delete ON eper_workflow_outbox_replay_audit;
CREATE TRIGGER eper_workflow_outbox_replay_audit_no_delete
  BEFORE DELETE ON eper_workflow_outbox_replay_audit
  FOR EACH ROW EXECUTE FUNCTION eper_reject_workflow_outbox_replay_audit_mutation();

DROP TRIGGER IF EXISTS eper_workflow_outbox_replay_audit_no_truncate ON eper_workflow_outbox_replay_audit;
CREATE TRIGGER eper_workflow_outbox_replay_audit_no_truncate
  BEFORE TRUNCATE ON eper_workflow_outbox_replay_audit
  FOR EACH STATEMENT EXECUTE FUNCTION eper_reject_workflow_outbox_replay_audit_mutation();

ALTER TABLE eper_workflow_outbox_replay_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_workflow_outbox_replay_audit FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_application_isolation ON eper_workflow_outbox_replay_audit;
CREATE POLICY tenant_application_isolation ON eper_workflow_outbox_replay_audit
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

COMMIT;
