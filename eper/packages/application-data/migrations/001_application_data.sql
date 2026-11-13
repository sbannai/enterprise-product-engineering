CREATE TABLE IF NOT EXISTS eper_application_data_models (
  tenant_id text NOT NULL,
  application_id text NOT NULL,
  entity_type text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields)='array'),
  relationships jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(relationships)='array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, entity_type, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS eper_application_data_models_one_active_idx
  ON eper_application_data_models(tenant_id, application_id, entity_type)
  WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS eper_application_data_records (
  tenant_id text NOT NULL,
  application_id text NOT NULL,
  entity_type text NOT NULL,
  record_id text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  version integer NOT NULL CHECK (version > 0),
  state text NOT NULL CHECK (state IN ('ACTIVE','ARCHIVED')),
  data jsonb NOT NULL CHECK (jsonb_typeof(data)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, entity_type, record_id)
);
CREATE INDEX IF NOT EXISTS eper_application_data_records_query_idx
  ON eper_application_data_records(tenant_id, application_id, entity_type, state, record_id);
CREATE INDEX IF NOT EXISTS eper_application_data_records_data_gin_idx
  ON eper_application_data_records USING gin(data);

ALTER TABLE eper_application_data_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_application_data_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_application_data_models_tenant_policy ON eper_application_data_models;
CREATE POLICY eper_application_data_models_tenant_policy ON eper_application_data_models
  USING (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true))
  WITH CHECK (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true));
DROP POLICY IF EXISTS eper_application_data_records_tenant_policy ON eper_application_data_records;
CREATE POLICY eper_application_data_records_tenant_policy ON eper_application_data_records
  USING (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true))
  WITH CHECK (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true));

-- Create-operation idempotency responses are committed with the record, audit evidence and outbox event.
CREATE TABLE IF NOT EXISTS eper_application_data_idempotency (
  tenant_id text NOT NULL,
  application_id text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response jsonb NOT NULL CHECK (jsonb_typeof(response)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, idempotency_key)
);
ALTER TABLE eper_application_data_idempotency ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_application_data_idempotency_tenant_policy ON eper_application_data_idempotency;
CREATE POLICY eper_application_data_idempotency_tenant_policy ON eper_application_data_idempotency
  USING (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true))
  WITH CHECK (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true));
