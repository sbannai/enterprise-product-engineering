-- Customer-wide provider defaults with application-scoped policy overrides.
-- Configuration contains non-secret policy only; credentials remain in the secret manager.
BEGIN;

CREATE OR REPLACE FUNCTION eper_provider_policy_contains_secret_key(value JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  entry RECORD;
  key_name TEXT;
BEGIN
  IF jsonb_typeof(value) = 'object' THEN
    FOR entry IN SELECT key, val FROM jsonb_each(value) AS item(key, val) LOOP
      key_name := lower(regexp_replace(entry.key, '[-_]', '', 'g'));
      IF key_name = ANY (ARRAY[
        'password', 'secret', 'clientsecret', 'accesstoken', 'refreshtoken',
        'apikey', 'authorization', 'token', 'privatekey', 'credential'
      ]) THEN
        RETURN TRUE;
      END IF;
      IF eper_provider_policy_contains_secret_key(entry.val) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(value) = 'array' THEN
    FOR entry IN SELECT val FROM jsonb_array_elements(value) AS item(val) LOOP
      IF eper_provider_policy_contains_secret_key(entry.val) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  END IF;
  RETURN FALSE;
END;
$$;

CREATE TABLE IF NOT EXISTS eper_tenant_provider_defaults (
  tenant_id TEXT NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  connection_id UUID NOT NULL,
  defaults JSONB NOT NULL CHECK (
    jsonb_typeof(defaults) = 'object'
    AND NOT eper_provider_policy_contains_secret_key(defaults)
  ),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, connection_id),
  FOREIGN KEY (tenant_id, connection_id)
    REFERENCES eper_provider_connections (tenant_id, connection_id)
);

CREATE INDEX IF NOT EXISTS eper_tenant_provider_defaults_updated_idx
  ON eper_tenant_provider_defaults (tenant_id, updated_at DESC);

ALTER TABLE eper_tenant_provider_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_tenant_provider_defaults FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_tenant_provider_defaults_tenant_scope ON eper_tenant_provider_defaults;
CREATE POLICY eper_tenant_provider_defaults_tenant_scope ON eper_tenant_provider_defaults
  USING (tenant_id = current_setting('eper.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('eper.tenant_id', true));

COMMIT;
