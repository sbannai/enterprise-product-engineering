-- Durable provider-neutral customer subject bindings and opaque browser sessions.
-- Identity-service access is explicitly gated; tenant-scoped reads also honor tenant context.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_customer_oidc_subject_bindings (
  issuer text NOT NULL CHECK (length(btrim(issuer)) BETWEEN 1 AND 2048),
  subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 512),
  tenant_id varchar(128) NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  actor_id varchar(128) NOT NULL CHECK (length(btrim(actor_id)) BETWEEN 1 AND 128),
  binding_status varchar(16) NOT NULL DEFAULT 'active' CHECK (binding_status IN ('active','revoked')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(128) NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 128),
  revoked_at timestamptz,
  revoked_by varchar(128),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer, subject),
  UNIQUE (tenant_id, actor_id, issuer, subject),
  CHECK ((binding_status = 'active' AND revoked_at IS NULL AND revoked_by IS NULL)
      OR (binding_status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS eper_customer_oidc_login_transactions (
  state_hash char(64) PRIMARY KEY CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  nonce_hash char(64) NOT NULL CHECK (nonce_hash ~ '^[a-f0-9]{64}$'),
  pkce_verifier_ciphertext text NOT NULL CHECK (length(pkce_verifier_ciphertext) BETWEEN 32 AND 8192),
  issuer text NOT NULL CHECK (length(btrim(issuer)) BETWEEN 1 AND 2048),
  redirect_uri text NOT NULL CHECK (length(btrim(redirect_uri)) BETWEEN 1 AND 2048),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS eper_customer_oidc_login_expiry_idx
  ON eper_customer_oidc_login_transactions (expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS eper_customer_browser_sessions (
  session_hash char(64) PRIMARY KEY CHECK (session_hash ~ '^[a-f0-9]{64}$'),
  issuer text NOT NULL,
  subject text NOT NULL,
  tenant_id varchar(128) NOT NULL,
  actor_id varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason varchar(64),
  rotated_from_hash char(64),
  FOREIGN KEY (issuer, subject)
    REFERENCES eper_customer_oidc_subject_bindings (issuer, subject) ON DELETE RESTRICT,
  CHECK (idle_expires_at <= absolute_expires_at),
  CHECK (revoked_at IS NULL OR revoked_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS eper_customer_browser_sessions_actor_idx
  ON eper_customer_browser_sessions (tenant_id, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS eper_customer_browser_sessions_expiry_idx
  ON eper_customer_browser_sessions (idle_expires_at, absolute_expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS eper_customer_identity_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(128) NOT NULL,
  actor_id varchar(128) NOT NULL,
  action varchar(64) NOT NULL CHECK (action IN (
    'subject.bound','subject.revoked','session.created','session.rotated',
    'session.revoked','session.expired','session.denied'
  )),
  outcome varchar(16) NOT NULL CHECK (outcome IN ('success','denied','failure')),
  resource_hash char(64),
  correlation_id varchar(128) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX IF NOT EXISTS eper_customer_identity_events_scope_idx
  ON eper_customer_identity_events (tenant_id, actor_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION eper_customer_identity_events_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'EPER_CUSTOMER_IDENTITY_EVENTS_APPEND_ONLY'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
DROP TRIGGER IF EXISTS eper_customer_identity_events_no_update ON eper_customer_identity_events;
CREATE TRIGGER eper_customer_identity_events_no_update
  BEFORE UPDATE OR DELETE ON eper_customer_identity_events
  FOR EACH ROW EXECUTE FUNCTION eper_customer_identity_events_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'eper_customer_oidc_subject_bindings',
    'eper_customer_browser_sessions',
    'eper_customer_identity_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS eper_identity_service_or_tenant ON %I', t);
    EXECUTE format(
      'CREATE POLICY eper_identity_service_or_tenant ON %I USING (current_setting(''eper.identity_service'', true) = ''true'' OR tenant_id = current_setting(''eper.tenant_id'', true)) WITH CHECK (current_setting(''eper.identity_service'', true) = ''true'' OR tenant_id = current_setting(''eper.tenant_id'', true))',
      t
    );
  END LOOP;
END $;

ALTER TABLE eper_customer_oidc_login_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_customer_oidc_login_transactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_identity_service_only ON eper_customer_oidc_login_transactions;
CREATE POLICY eper_identity_service_only ON eper_customer_oidc_login_transactions
  USING (current_setting('eper.identity_service', true) = 'true')
  WITH CHECK (current_setting('eper.identity_service', true) = 'true');

COMMIT;
