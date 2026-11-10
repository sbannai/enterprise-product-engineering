-- Durable, tenant/application-scoped Remote Desktop Sharing session and consent records.
-- No transport, screen capture, signalling or remote-control provider is provisioned here.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_remote_desktop_session (
  tenant_id TEXT NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  application_id TEXT NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  session_id UUID NOT NULL,
  requester_id TEXT NOT NULL CHECK (length(btrim(requester_id)) BETWEEN 1 AND 128),
  endpoint_id TEXT NOT NULL CHECK (length(btrim(endpoint_id)) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
    'REQUESTED','ACCEPTED','ACTIVE','STOPPED','DENIED','EXPIRED','REVOKED','DISCONNECTED'
  )),
  mode TEXT NOT NULL DEFAULT 'VIEW_ONLY' CHECK (mode IN ('VIEW_ONLY','REMOTE_CONTROL')),
  consent_grant_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, application_id, session_id),
  FOREIGN KEY (tenant_id, application_id)
    REFERENCES eper_tenant_application_assignment (tenant_id, application_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (expires_at > created_at),
  CHECK (status NOT IN ('ACCEPTED','ACTIVE') OR consent_grant_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS eper_remote_desktop_session_application_idx
  ON eper_remote_desktop_session (tenant_id, application_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS eper_remote_desktop_session_expiry_idx
  ON eper_remote_desktop_session (expires_at)
  WHERE status IN ('REQUESTED','ACCEPTED','ACTIVE');

CREATE TABLE IF NOT EXISTS eper_remote_desktop_consent (
  tenant_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  consent_grant_id UUID NOT NULL,
  session_id UUID NOT NULL,
  endpoint_id TEXT NOT NULL CHECK (length(btrim(endpoint_id)) BETWEEN 1 AND 160),
  subject_id TEXT NOT NULL CHECK (length(btrim(subject_id)) BETWEEN 1 AND 128),
  granted_mode TEXT NOT NULL CHECK (granted_mode IN ('VIEW_ONLY','REMOTE_CONTROL')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, application_id, consent_grant_id),
  FOREIGN KEY (tenant_id, application_id, session_id)
    REFERENCES eper_remote_desktop_session (tenant_id, application_id, session_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (expires_at > granted_at),
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

ALTER TABLE eper_remote_desktop_session
  DROP CONSTRAINT IF EXISTS eper_remote_desktop_session_consent_fk;
ALTER TABLE eper_remote_desktop_session
  ADD CONSTRAINT eper_remote_desktop_session_consent_fk
  FOREIGN KEY (tenant_id, application_id, consent_grant_id)
  REFERENCES eper_remote_desktop_consent (tenant_id, application_id, consent_grant_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE eper_remote_desktop_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_remote_desktop_session FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_remote_desktop_session_scope ON eper_remote_desktop_session;
CREATE POLICY eper_remote_desktop_session_scope ON eper_remote_desktop_session
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

ALTER TABLE eper_remote_desktop_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_remote_desktop_consent FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_remote_desktop_consent_scope ON eper_remote_desktop_consent;
CREATE POLICY eper_remote_desktop_consent_scope ON eper_remote_desktop_consent
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

COMMIT;
