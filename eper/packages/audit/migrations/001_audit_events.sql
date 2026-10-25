-- EPER cross-cutting audit event store.
-- Append-only event evidence. Application/runtime instrumentation and migration execution
-- are separate release steps; creating this schema alone does not provide audit coverage.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_audit_events (
  event_id UUID PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL,
  tenant_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('production', 'uat', 'sandbox')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('human', 'service', 'system')),
  actor_id TEXT NOT NULL,
  effective_roles JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(effective_roles) = 'array'),
  action TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
  reason_code TEXT,
  resource_type TEXT,
  resource_id TEXT,
  operation_id TEXT,
  correlation_id TEXT,
  request_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('api', 'ui', 'job', 'integration', 'platform')),
  operation_name TEXT NOT NULL,
  service_version TEXT,
  approval_id TEXT,
  parent_event_id UUID REFERENCES eper_audit_events(event_id),
  idempotency_key TEXT,
  schema_version SMALLINT NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  before_hash CHAR(64),
  after_hash CHAR(64),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  previous_event_hash CHAR(64),
  event_hash CHAR(64) NOT NULL CHECK (event_hash ~ '^[a-f0-9]{64}$'),
  integrity_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(integrity_metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS eper_audit_events_tenant_time_idx
  ON eper_audit_events (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS eper_audit_events_actor_time_idx
  ON eper_audit_events (tenant_id, actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS eper_audit_events_action_time_idx
  ON eper_audit_events (tenant_id, action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS eper_audit_events_correlation_idx
  ON eper_audit_events (tenant_id, correlation_id)
  WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS eper_audit_events_resource_idx
  ON eper_audit_events (tenant_id, resource_type, resource_id, occurred_at DESC)
  WHERE resource_type IS NOT NULL AND resource_id IS NOT NULL;

-- Corrections and retention/purge operations must be separately authorized and evidenced.
-- Application roles must not mutate or delete prior audit events.
CREATE OR REPLACE FUNCTION eper_reject_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'EPER_AUDIT_EVENTS_APPEND_ONLY'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;

DROP TRIGGER IF EXISTS eper_audit_events_no_update ON eper_audit_events;
CREATE TRIGGER eper_audit_events_no_update
BEFORE UPDATE ON eper_audit_events
FOR EACH ROW EXECUTE FUNCTION eper_reject_audit_event_mutation();

DROP TRIGGER IF EXISTS eper_audit_events_no_delete ON eper_audit_events;
CREATE TRIGGER eper_audit_events_no_delete
BEFORE DELETE ON eper_audit_events
FOR EACH ROW EXECUTE FUNCTION eper_reject_audit_event_mutation();

COMMIT;
