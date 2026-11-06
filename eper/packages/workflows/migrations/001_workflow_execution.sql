-- Durable, application-scoped workflow definitions and execution ledger.
-- Local development/integration migration. No cloud resources are provisioned.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_workflow_definition_versions (
  tenant_id varchar(128) NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  application_id varchar(128) NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  workflow_id varchar(128) NOT NULL CHECK (length(btrim(workflow_id)) BETWEEN 1 AND 128),
  definition_version integer NOT NULL CHECK (definition_version > 0),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  definition_digest char(64) NOT NULL CHECK (definition_digest ~ '^[a-f0-9]{64}$'),
  publication_status varchar(16) NOT NULL CHECK (publication_status IN ('active','retired')),
  published_by varchar(128) NOT NULL CHECK (length(btrim(published_by)) BETWEEN 1 AND 128),
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, workflow_id, definition_version),
  UNIQUE (tenant_id, application_id, workflow_id, definition_version, definition_digest),
  UNIQUE (tenant_id, application_id, workflow_id, definition_digest)
);
CREATE INDEX IF NOT EXISTS eper_workflow_definition_active_idx
  ON eper_workflow_definition_versions (tenant_id, application_id, workflow_id, definition_version DESC)
  WHERE publication_status = 'active';

CREATE TABLE IF NOT EXISTS eper_workflow_instances (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  instance_id uuid NOT NULL,
  workflow_id varchar(128) NOT NULL,
  definition_version integer NOT NULL CHECK (definition_version > 0),
  definition_digest char(64) NOT NULL CHECK (definition_digest ~ '^[a-f0-9]{64}$'),
  status varchar(16) NOT NULL CHECK (status IN ('running','completed','rejected','cancelled','failed')),
  current_activity_id varchar(128),
  business_reference varchar(256),
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, application_id, instance_id),
  FOREIGN KEY (tenant_id, application_id, workflow_id, definition_version, definition_digest)
    REFERENCES eper_workflow_definition_versions (tenant_id, application_id, workflow_id, definition_version, definition_digest)
    ON DELETE RESTRICT,
  CHECK (
    (status = 'running' AND current_activity_id IS NOT NULL AND completed_at IS NULL)
    OR (status <> 'running' AND completed_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS eper_workflow_instances_queue_idx
  ON eper_workflow_instances (tenant_id, application_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS eper_workflow_instances_workflow_idx
  ON eper_workflow_instances (tenant_id, application_id, workflow_id, created_at DESC);

CREATE TABLE IF NOT EXISTS eper_workflow_transitions (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  transition_id uuid NOT NULL,
  instance_id uuid NOT NULL,
  from_activity_id varchar(128),
  to_activity_id varchar(128),
  action varchar(16) NOT NULL CHECK (action IN ('start','submit','approve','reject','cancel')),
  actor_id varchar(128) NOT NULL,
  actor_role varchar(128),
  expected_version bigint NOT NULL CHECK (expected_version >= 0),
  resulting_version bigint NOT NULL CHECK (resulting_version > expected_version),
  idempotency_key varchar(128) NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 16 AND 128),
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  correlation_id varchar(128) NOT NULL CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 128),
  payload_digest char(64) CHECK (payload_digest IS NULL OR payload_digest ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, transition_id),
  UNIQUE (tenant_id, application_id, instance_id, transition_id),
  UNIQUE (tenant_id, application_id, instance_id, idempotency_key),
  FOREIGN KEY (tenant_id, application_id, instance_id)
    REFERENCES eper_workflow_instances (tenant_id, application_id, instance_id)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS eper_workflow_transitions_history_idx
  ON eper_workflow_transitions (tenant_id, application_id, instance_id, occurred_at, transition_id);

CREATE TABLE IF NOT EXISTS eper_workflow_idempotency (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  instance_id uuid NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  transition_id uuid NOT NULL,
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, instance_id, idempotency_key),
  FOREIGN KEY (tenant_id, application_id, instance_id)
    REFERENCES eper_workflow_instances (tenant_id, application_id, instance_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, application_id, instance_id, transition_id)
    REFERENCES eper_workflow_transitions (tenant_id, application_id, instance_id, transition_id)
    ON DELETE RESTRICT
);


-- Definition versions, transition history and idempotency receipts are append-only.
CREATE OR REPLACE FUNCTION eper_reject_workflow_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'EPER_WORKFLOW_LEDGER_APPEND_ONLY'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;

DROP TRIGGER IF EXISTS eper_workflow_definitions_no_update ON eper_workflow_definition_versions;
CREATE TRIGGER eper_workflow_definitions_no_update
BEFORE UPDATE OR DELETE ON eper_workflow_definition_versions
FOR EACH ROW EXECUTE FUNCTION eper_reject_workflow_ledger_mutation();

DROP TRIGGER IF EXISTS eper_workflow_transitions_no_update ON eper_workflow_transitions;
CREATE TRIGGER eper_workflow_transitions_no_update
BEFORE UPDATE OR DELETE ON eper_workflow_transitions
FOR EACH ROW EXECUTE FUNCTION eper_reject_workflow_ledger_mutation();

DROP TRIGGER IF EXISTS eper_workflow_idempotency_no_update ON eper_workflow_idempotency;
CREATE TRIGGER eper_workflow_idempotency_no_update
BEFORE UPDATE OR DELETE ON eper_workflow_idempotency
FOR EACH ROW EXECUTE FUNCTION eper_reject_workflow_ledger_mutation();

-- Force tenant/application isolation. Runtime connections must set both context values.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'eper_workflow_definition_versions','eper_workflow_instances',
    'eper_workflow_transitions','eper_workflow_idempotency'
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

COMMIT;
