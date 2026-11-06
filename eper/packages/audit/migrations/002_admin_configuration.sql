-- Durable tenant-scoped admin configuration. Mutations are committed with audit events
-- by PostgresAdminConfigurationStore; this migration alone does not enable API usage.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_admin_configuration (
  tenant_id TEXT NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('workflows', 'roles-access', 'price-book', 'payment-vendor')),
  config JSONB NOT NULL,
  version BIGINT NOT NULL CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, resource_type),
  CHECK (
    (resource_type = 'workflows' AND jsonb_typeof(config) = 'array') OR
    (resource_type = 'roles-access' AND jsonb_typeof(config) = 'array') OR
    (resource_type = 'price-book' AND jsonb_typeof(config) = 'array') OR
    (resource_type = 'payment-vendor' AND jsonb_typeof(config) = 'object')
  )
);

CREATE INDEX IF NOT EXISTS eper_admin_configuration_tenant_updated_idx
  ON eper_admin_configuration (tenant_id, updated_at DESC);

COMMIT;
