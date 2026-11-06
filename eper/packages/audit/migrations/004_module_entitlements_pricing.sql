-- Modular product catalogue, versioned prices, customer entitlements, and role permissions.
-- API/service mutations must append correlated durable audit events in the same transaction.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_module_catalog (
  module_key TEXT PRIMARY KEY CHECK (length(btrim(module_key)) BETWEEN 1 AND 128),
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'deprecated', 'disabled')),
  dependencies JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dependencies) = 'array'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128)
);

CREATE TABLE IF NOT EXISTS eper_module_price (
  price_id UUID PRIMARY KEY,
  module_key TEXT NOT NULL REFERENCES eper_module_catalog(module_key),
  price_version BIGINT NOT NULL CHECK (price_version > 0),
  pricing_model TEXT NOT NULL CHECK (pricing_model IN ('per_customer', 'per_application', 'usage_based', 'one_time')),
  amount NUMERIC(19, 4) NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual', 'one_time', 'usage')),
  usage_unit TEXT,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 128),
  UNIQUE (module_key, price_version),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK ((pricing_model = 'usage_based' AND usage_unit IS NOT NULL AND length(btrim(usage_unit)) > 0)
      OR (pricing_model <> 'usage_based' AND usage_unit IS NULL))
);

CREATE INDEX IF NOT EXISTS eper_module_price_effective_idx
  ON eper_module_price (module_key, status, effective_from DESC);

CREATE TABLE IF NOT EXISTS eper_customer_module_entitlement (
  tenant_id TEXT NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  module_key TEXT NOT NULL REFERENCES eper_module_catalog(module_key),
  entitlement_status TEXT NOT NULL CHECK (entitlement_status IN ('pending', 'trial', 'active', 'suspended', 'cancelled', 'expired')),
  price_id UUID REFERENCES eper_module_price(price_id),
  accepted_price_version BIGINT,
  agreed_amount NUMERIC(19, 4) CHECK (agreed_amount IS NULL OR agreed_amount >= 0),
  agreed_currency CHAR(3) CHECK (agreed_currency IS NULL OR agreed_currency ~ '^[A-Z]{3}$'),
  billing_interval TEXT CHECK (billing_interval IS NULL OR billing_interval IN ('monthly', 'annual', 'one_time', 'usage')),
  limits JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(limits) = 'object'),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  grace_until TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, module_key),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CHECK ((price_id IS NULL AND accepted_price_version IS NULL AND agreed_amount IS NULL AND agreed_currency IS NULL AND billing_interval IS NULL)
      OR (price_id IS NOT NULL AND accepted_price_version IS NOT NULL AND agreed_amount IS NOT NULL AND agreed_currency IS NOT NULL AND billing_interval IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS eper_customer_module_entitlement_status_idx
  ON eper_customer_module_entitlement (tenant_id, entitlement_status, module_key);

CREATE TABLE IF NOT EXISTS eper_customer_module_permission (
  tenant_id TEXT NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  module_key TEXT NOT NULL REFERENCES eper_module_catalog(module_key),
  role_key TEXT NOT NULL CHECK (length(btrim(role_key)) BETWEEN 1 AND 128),
  permission_key TEXT NOT NULL CHECK (length(btrim(permission_key)) BETWEEN 1 AND 128),
  allowed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, module_key, role_key, permission_key)
);

CREATE INDEX IF NOT EXISTS eper_customer_module_permission_role_idx
  ON eper_customer_module_permission (tenant_id, role_key, module_key);

COMMIT;
