-- Customer-wide and application-scoped settings storage.
-- Credential values are intentionally not stored in these tables; only secret-store references belong here.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_customer_setting (
  tenant_id TEXT NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  setting_key TEXT NOT NULL CHECK (length(btrim(setting_key)) BETWEEN 1 AND 128),
  config JSONB NOT NULL,
  version BIGINT NOT NULL CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, setting_key),
  CHECK (jsonb_typeof(config) IN ('object', 'array', 'string', 'number', 'boolean', 'null'))
);

CREATE INDEX IF NOT EXISTS eper_customer_setting_updated_idx
  ON eper_customer_setting (tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS eper_application_setting (
  tenant_id TEXT NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  application_id TEXT NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  setting_key TEXT NOT NULL CHECK (length(btrim(setting_key)) BETWEEN 1 AND 128),
  config JSONB NOT NULL,
  version BIGINT NOT NULL CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, application_id, setting_key),
  CHECK (jsonb_typeof(config) IN ('object', 'array', 'string', 'number', 'boolean', 'null'))
);

CREATE INDEX IF NOT EXISTS eper_application_setting_updated_idx
  ON eper_application_setting (tenant_id, application_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS eper_integration_credential_reference (
  tenant_id TEXT NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  application_id TEXT NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  integration_key TEXT NOT NULL CHECK (length(btrim(integration_key)) BETWEEN 1 AND 128),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'uat', 'sandbox')),
  secret_reference TEXT NOT NULL CHECK (length(btrim(secret_reference)) BETWEEN 1 AND 512),
  configured BOOLEAN NOT NULL DEFAULT TRUE,
  rotated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, application_id, integration_key, environment)
);

CREATE INDEX IF NOT EXISTS eper_integration_credential_reference_updated_idx
  ON eper_integration_credential_reference (tenant_id, application_id, updated_at DESC);

COMMIT;
