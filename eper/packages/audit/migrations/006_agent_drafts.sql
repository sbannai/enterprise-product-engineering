-- Durable agent drafts. Tenant and application are part of every scoped read/write predicate.
CREATE TABLE IF NOT EXISTS eper_agent_drafts (
  id uuid PRIMARY KEY,
  tenant_id varchar(200) NOT NULL,
  application_id varchar(128) NOT NULL,
  created_by varchar(100) NOT NULL,
  agent varchar(16) NOT NULL CHECK (agent IN ('crm','sales','marketing')),
  intent varchar(80) NOT NULL,
  content jsonb NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'PENDING_APPROVAL'
    CHECK (status IN ('PENDING_APPROVAL','APPROVED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by varchar(100),
  reviewed_at timestamptz,
  review_note varchar(1000),
  CONSTRAINT eper_agent_draft_review_state CHECK (
    (status = 'PENDING_APPROVAL' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status <> 'PENDING_APPROVAL' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT eper_agent_draft_tenant_app_id_unique UNIQUE (tenant_id, application_id, id)
);
CREATE INDEX IF NOT EXISTS eper_agent_drafts_scope_status_created_idx
  ON eper_agent_drafts (tenant_id, application_id, status, created_at DESC);
