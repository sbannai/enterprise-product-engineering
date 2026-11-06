-- Durable actor-to-application membership, separate from tenant-wide application assignment.
-- Every membership change is expected to be performed through the audited assignment service.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_actor_application_assignment (
  tenant_id TEXT NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  actor_id TEXT NOT NULL CHECK (length(btrim(actor_id)) BETWEEN 1 AND 128),
  application_id TEXT NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  assignment_status TEXT NOT NULL DEFAULT 'active' CHECK (assignment_status IN ('active', 'revoked')),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by TEXT NOT NULL CHECK (length(btrim(assigned_by)) BETWEEN 1 AND 128),
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT CHECK (revoked_by IS NULL OR length(btrim(revoked_by)) BETWEEN 1 AND 128),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, actor_id, application_id),
  CHECK (
    (assignment_status = 'active' AND revoked_at IS NULL AND revoked_by IS NULL)
    OR (assignment_status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS eper_actor_application_assignment_active_idx
  ON eper_actor_application_assignment (tenant_id, actor_id, application_id)
  WHERE assignment_status = 'active';

CREATE INDEX IF NOT EXISTS eper_actor_application_assignment_application_idx
  ON eper_actor_application_assignment (tenant_id, application_id, assignment_status);

COMMIT;
