BEGIN;

CREATE TABLE IF NOT EXISTS eper_application_data_models (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  entity_type varchar(128) NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  model_status varchar(16) NOT NULL CHECK (model_status IN ('DRAFT','PUBLISHED')),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  schema_digest char(64) NOT NULL CHECK (schema_digest ~ '^[a-f0-9]{64}$'),
  created_by varchar(128) NOT NULL,
  published_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  PRIMARY KEY (tenant_id, application_id, entity_type, schema_version),
  CHECK ((model_status = 'PUBLISHED' AND published_by IS NOT NULL AND published_at IS NOT NULL)
      OR (model_status = 'DRAFT' AND published_by IS NULL AND published_at IS NULL))
);
CREATE INDEX IF NOT EXISTS eper_application_data_models_latest_idx
  ON eper_application_data_models (tenant_id, application_id, entity_type, schema_version DESC);

CREATE TABLE IF NOT EXISTS eper_application_data_records (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  entity_type varchar(128) NOT NULL,
  record_id uuid NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  record_version integer NOT NULL CHECK (record_version > 0),
  record_status varchar(16) NOT NULL CHECK (record_status IN ('ACTIVE','ARCHIVED')),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_by varchar(128) NOT NULL,
  updated_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, entity_type, record_id),
  FOREIGN KEY (tenant_id, application_id, entity_type, schema_version)
    REFERENCES eper_application_data_models (tenant_id, application_id, entity_type, schema_version)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS eper_application_data_records_query_idx
  ON eper_application_data_records (tenant_id, application_id, entity_type, record_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS eper_application_data_audit (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  audit_id uuid NOT NULL,
  entity_type varchar(128) NOT NULL,
  record_id uuid,
  action varchar(64) NOT NULL,
  actor_id varchar(128) NOT NULL,
  correlation_id varchar(160) NOT NULL,
  requirement_id varchar(128) NOT NULL,
  occurred_at timestamptz NOT NULL,
  before_version integer,
  after_version integer,
  payload_digest char(64) NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (tenant_id, application_id, audit_id)
);
CREATE INDEX IF NOT EXISTS eper_application_data_audit_resource_idx
  ON eper_application_data_audit (tenant_id, application_id, entity_type, record_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS eper_application_data_outbox (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  event_id uuid NOT NULL,
  aggregate_type varchar(64) NOT NULL,
  aggregate_id varchar(160) NOT NULL,
  event_type varchar(128) NOT NULL,
  event_version integer NOT NULL CHECK (event_version > 0),
  correlation_id varchar(160) NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, application_id, event_id)
);
CREATE INDEX IF NOT EXISTS eper_application_data_outbox_time_idx
  ON eper_application_data_outbox (tenant_id, application_id, occurred_at, event_id);

CREATE TABLE IF NOT EXISTS eper_application_data_idempotency (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  idempotency_key varchar(160) NOT NULL,
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, idempotency_key)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'eper_application_data_models','eper_application_data_records',
    'eper_application_data_audit','eper_application_data_outbox',
    'eper_application_data_idempotency'
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

CREATE OR REPLACE FUNCTION eper_application_data_reject_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'APPLICATION_DATA_AUDIT_APPEND_ONLY';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS eper_application_data_audit_no_update ON eper_application_data_audit;
CREATE TRIGGER eper_application_data_audit_no_update
  BEFORE UPDATE OR DELETE ON eper_application_data_audit
  FOR EACH ROW EXECUTE FUNCTION eper_application_data_reject_audit_mutation();

COMMIT;
