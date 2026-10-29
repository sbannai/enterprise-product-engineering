-- EPER capability persistence v1. All tenant-owned rows require tenant_id.
-- Apply only to local development/integration databases in this phase.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS authoritative_records (
  tenant_id text NOT NULL,
  record_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  state text NOT NULL,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, record_id)
);

CREATE TABLE IF NOT EXISTS authorization_policies (
  tenant_id text NOT NULL,
  policy_id text NOT NULL,
  principal_id text,
  actions jsonb NOT NULL CHECK (jsonb_typeof(actions) = 'array' AND jsonb_array_length(actions) > 0),
  resources jsonb NOT NULL CHECK (jsonb_typeof(resources) = 'array' AND jsonb_array_length(resources) > 0),
  effect text NOT NULL CHECK (effect IN ('ALLOW', 'DENY')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, policy_id)
);

CREATE TABLE IF NOT EXISTS audit_evidence (
  tenant_id text NOT NULL,
  evidence_id text NOT NULL,
  requirement_id text NOT NULL,
  action text NOT NULL,
  principal_id text NOT NULL,
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  canonicalization_version integer NOT NULL DEFAULT 1 CHECK (canonicalization_version > 0),
  integrity_hash char(64) NOT NULL CHECK (integrity_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (tenant_id, evidence_id)
);
CREATE INDEX IF NOT EXISTS audit_evidence_requirement_idx
  ON audit_evidence (tenant_id, requirement_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS workflow_exceptions (
  tenant_id text NOT NULL,
  exception_id text NOT NULL,
  requirement_id text NOT NULL,
  code text NOT NULL,
  message text NOT NULL,
  state text NOT NULL CHECK (state IN ('OPEN', 'RETRYING', 'RESOLVED', 'ESCALATED')),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  idempotency_key text NOT NULL,
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  owner text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, exception_id),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS governed_reports (
  tenant_id text NOT NULL,
  report_id text NOT NULL,
  publication_id text NOT NULL,
  "values" jsonb NOT NULL CHECK (jsonb_typeof("values") = 'object'),
  source_requirement_ids jsonb NOT NULL
    CHECK (jsonb_typeof(source_requirement_ids) = 'array' AND jsonb_array_length(source_requirement_ids) > 0),
  generated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, report_id, publication_id)
);

CREATE TABLE IF NOT EXISTS transactional_outbox (
  event_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  event_version integer NOT NULL DEFAULT 1 CHECK (event_version > 0),
  correlation_id text NOT NULL,
  causation_id text,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  delivered_at timestamptz,
  last_error text
);
CREATE INDEX IF NOT EXISTS transactional_outbox_pending_idx
  ON transactional_outbox (available_at, occurred_at)
  WHERE delivered_at IS NULL;

-- Tenant isolation is enforced both in application predicates and by PostgreSQL RLS.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'authoritative_records', 'authorization_policies', 'audit_evidence',
    'workflow_exceptions', 'governed_reports', 'transactional_outbox'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''eper.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''eper.tenant_id'', true))',
      table_name
    );
  END LOOP;
END $$;

INSERT INTO eper_schema_migrations(version) VALUES ('001_capability_persistence')
ON CONFLICT (version) DO NOTHING;
COMMIT;
