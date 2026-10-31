-- Append-only lifecycle events identify the currently published workflow version.
-- Publication history is authoritative; definition snapshots remain immutable.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_workflow_publication_events (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  workflow_id varchar(128) NOT NULL,
  event_sequence bigint GENERATED ALWAYS AS IDENTITY,
  event_type varchar(16) NOT NULL CHECK (event_type IN ('published','retired')),
  definition_version integer NOT NULL CHECK (definition_version > 0),
  actor_id varchar(128) NOT NULL CHECK (length(btrim(actor_id)) BETWEEN 1 AND 128),
  correlation_id varchar(128) NOT NULL CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 128),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, event_sequence),
  FOREIGN KEY (tenant_id, application_id, workflow_id, definition_version)
    REFERENCES eper_workflow_definition_versions (tenant_id, application_id, workflow_id, definition_version)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS eper_workflow_publication_current_idx
  ON eper_workflow_publication_events
    (tenant_id, application_id, workflow_id, event_sequence DESC);

CREATE OR REPLACE FUNCTION eper_reject_workflow_publication_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'EPER_WORKFLOW_PUBLICATION_LEDGER_APPEND_ONLY'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;

DROP TRIGGER IF EXISTS eper_workflow_publication_no_update_delete
  ON eper_workflow_publication_events;
CREATE TRIGGER eper_workflow_publication_no_update_delete
BEFORE UPDATE OR DELETE ON eper_workflow_publication_events
FOR EACH ROW EXECUTE FUNCTION eper_reject_workflow_publication_mutation();

DROP TRIGGER IF EXISTS eper_workflow_publication_no_truncate
  ON eper_workflow_publication_events;
CREATE TRIGGER eper_workflow_publication_no_truncate
BEFORE TRUNCATE ON eper_workflow_publication_events
FOR EACH STATEMENT EXECUTE FUNCTION eper_reject_workflow_publication_mutation();

-- Protect every append-only workflow ledger from bulk truncation as well.
DROP TRIGGER IF EXISTS eper_workflow_definitions_no_truncate
  ON eper_workflow_definition_versions;
CREATE TRIGGER eper_workflow_definitions_no_truncate
BEFORE TRUNCATE ON eper_workflow_definition_versions
FOR EACH STATEMENT EXECUTE FUNCTION eper_reject_workflow_ledger_mutation();

DROP TRIGGER IF EXISTS eper_workflow_transitions_no_truncate
  ON eper_workflow_transitions;
CREATE TRIGGER eper_workflow_transitions_no_truncate
BEFORE TRUNCATE ON eper_workflow_transitions
FOR EACH STATEMENT EXECUTE FUNCTION eper_reject_workflow_ledger_mutation();

DROP TRIGGER IF EXISTS eper_workflow_idempotency_no_truncate
  ON eper_workflow_idempotency;
CREATE TRIGGER eper_workflow_idempotency_no_truncate
BEFORE TRUNCATE ON eper_workflow_idempotency
FOR EACH STATEMENT EXECUTE FUNCTION eper_reject_workflow_ledger_mutation();

ALTER TABLE eper_workflow_publication_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_workflow_publication_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_application_isolation
  ON eper_workflow_publication_events;
CREATE POLICY tenant_application_isolation
  ON eper_workflow_publication_events
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

COMMIT;
