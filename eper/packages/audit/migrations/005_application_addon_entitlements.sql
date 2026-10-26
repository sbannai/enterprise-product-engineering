-- Per-application optional add-ons (Marketing, Sales, AI) with independent entitlements and price snapshots.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_application_addon_entitlement (
  tenant_id TEXT NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  application_id TEXT NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  addon_key TEXT NOT NULL REFERENCES eper_module_catalog(module_key),
  entitlement_status TEXT NOT NULL CHECK (entitlement_status IN ('not_selected', 'requested', 'pending_approval', 'pending_payment', 'active', 'suspended', 'cancelled', 'expired')),
  price_id UUID REFERENCES eper_module_price(price_id),
  accepted_price_version BIGINT,
  agreed_amount NUMERIC(19, 4) CHECK (agreed_amount IS NULL OR agreed_amount >= 0),
  agreed_currency CHAR(3) CHECK (agreed_currency IS NULL OR agreed_currency ~ '^[A-Z]{3}$'),
  billing_interval TEXT CHECK (billing_interval IS NULL OR billing_interval IN ('monthly', 'annual', 'one_time', 'usage')),
  usage_limit JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(usage_limit) = 'object'),
  selected_at TIMESTAMPTZ,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  requested_by TEXT CHECK (requested_by IS NULL OR length(btrim(requested_by)) BETWEEN 1 AND 128),
  approved_by TEXT CHECK (approved_by IS NULL OR length(btrim(approved_by)) BETWEEN 1 AND 128),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (tenant_id, application_id, addon_key),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from),
  CHECK ((price_id IS NULL AND accepted_price_version IS NULL AND agreed_amount IS NULL AND agreed_currency IS NULL AND billing_interval IS NULL)
      OR (price_id IS NOT NULL AND accepted_price_version IS NOT NULL AND agreed_amount IS NOT NULL AND agreed_currency IS NOT NULL AND billing_interval IS NOT NULL)),
  CHECK (entitlement_status <> 'active' OR (price_id IS NOT NULL AND selected_at IS NOT NULL AND effective_from IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS eper_application_addon_entitlement_status_idx
  ON eper_application_addon_entitlement (tenant_id, application_id, entitlement_status);

COMMIT;
