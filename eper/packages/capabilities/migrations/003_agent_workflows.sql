-- Durable tenant/application-scoped agent jobs, drafts, approvals and configuration.
-- Local development/integration migration; no external providers or cloud resources are provisioned.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_agent_jobs (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  job_id uuid NOT NULL,
  requested_by varchar(128) NOT NULL,
  agent_id varchar(32) NOT NULL CHECK (agent_id IN ('crm','sales','marketing')),
  intent varchar(80) NOT NULL CHECK (intent ~ '^[a-z][a-z0-9-]{1,79}$'),
  status varchar(32) NOT NULL CHECK (status IN ('queued','running','awaiting_approval','succeeded','failed','cancelled')),
  idempotency_key varchar(128) NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  input jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner varchar(128),
  lease_expires_at timestamptz,
  deadline_at timestamptz NOT NULL,
  failure_code varchar(80),
  result_ref text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, job_id),
  UNIQUE (tenant_id, application_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS eper_agent_jobs_claim_idx
  ON eper_agent_jobs (status, available_at, created_at)
  WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS eper_agent_jobs_scope_idx
  ON eper_agent_jobs (tenant_id, application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS eper_agent_job_drafts (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  draft_id uuid NOT NULL,
  job_id uuid NOT NULL,
  agent_id varchar(32) NOT NULL CHECK (agent_id IN ('crm','sales','marketing')),
  intent varchar(80) NOT NULL,
  status varchar(32) NOT NULL CHECK (status IN ('pending_approval','approved','rejected','expired')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  source_references jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_references) = 'array'),
  validation_findings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_findings) = 'array'),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, application_id, draft_id),
  UNIQUE (tenant_id, application_id, job_id),
  FOREIGN KEY (tenant_id, application_id, job_id)
    REFERENCES eper_agent_jobs (tenant_id, application_id, job_id)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS eper_agent_job_drafts_queue_idx
  ON eper_agent_job_drafts (tenant_id, application_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS eper_agent_approvals (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  approval_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  draft_version integer NOT NULL CHECK (draft_version > 0),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  action varchar(16) NOT NULL CHECK (action IN ('approve','reject')),
  actor_id varchar(128) NOT NULL,
  actor_role varchar(80) NOT NULL,
  note varchar(1000),
  decided_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, approval_id),
  FOREIGN KEY (tenant_id, application_id, draft_id)
    REFERENCES eper_agent_job_drafts (tenant_id, application_id, draft_id)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS eper_agent_approvals_draft_idx
  ON eper_agent_approvals (tenant_id, application_id, draft_id, decided_at DESC);

CREATE TABLE IF NOT EXISTS eper_agent_configurations (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  environment varchar(16) NOT NULL CHECK (environment IN ('development','test','uat','production')),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  version integer NOT NULL CHECK (version > 0),
  configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration) = 'object'),
  updated_by varchar(128) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, environment),
  UNIQUE (tenant_id, application_id, environment, version)
);

-- Enforce tenant and application boundaries even when a query omits an explicit predicate.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'eper_agent_jobs','eper_agent_job_drafts','eper_agent_approvals','eper_agent_configurations'
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

INSERT INTO eper_schema_migrations(version) VALUES ('003_agent_workflows')
ON CONFLICT (version) DO NOTHING;
COMMIT;
