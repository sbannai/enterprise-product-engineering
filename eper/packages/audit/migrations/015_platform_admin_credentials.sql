-- Durable Product Admin API credentials. Raw bearer values are never persisted.
BEGIN;
CREATE TABLE IF NOT EXISTS eper_platform_admin_credentials (
  credential_id TEXT PRIMARY KEY CHECK (length(btrim(credential_id)) BETWEEN 1 AND 128),
  platform_actor_id TEXT NOT NULL CHECK (length(btrim(platform_actor_id)) BETWEEN 1 AND 128),
  token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  permissions JSONB NOT NULL CHECK (jsonb_typeof(permissions) = 'array' AND jsonb_array_length(permissions) BETWEEN 1 AND 4),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 128),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS eper_platform_admin_credentials_active_idx
  ON eper_platform_admin_credentials (credential_id, expires_at)
  WHERE revoked_at IS NULL;
COMMIT;
