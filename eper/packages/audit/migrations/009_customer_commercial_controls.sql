-- Durable customer lifecycle and accepted single-/multi-application tariff controls.
-- Assignment activation must lock the tenant and enforce this snapshot transactionally.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_customer_account (
  tenant_id TEXT PRIMARY KEY CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  customer_status TEXT NOT NULL CHECK (customer_status IN ('active', 'inactive', 'suspended', 'disabled')),
  status_reason TEXT NOT NULL CHECK (length(btrim(status_reason)) BETWEEN 1 AND 1000),
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128)
);

CREATE TABLE IF NOT EXISTS eper_commercial_tariff_plan (
  tariff_key TEXT NOT NULL CHECK (length(btrim(tariff_key)) BETWEEN 1 AND 128),
  tariff_version BIGINT NOT NULL CHECK (tariff_version > 0),
  billing_basis TEXT NOT NULL CHECK (billing_basis IN ('single_application', 'multi_application')),
  max_applications INTEGER NOT NULL CHECK (
    (billing_basis = 'single_application' AND max_applications = 1) OR
    (billing_basis = 'multi_application' AND max_applications >= 2)
  ),
  amount NUMERIC(19,4) NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual', 'one_time')),
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ,
  tariff_status TEXT NOT NULL DEFAULT 'draft' CHECK (tariff_status IN ('draft', 'active', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 128),
  PRIMARY KEY (tariff_key, tariff_version),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE IF NOT EXISTS eper_customer_tariff_assignment (
  tenant_id TEXT PRIMARY KEY REFERENCES eper_customer_account(tenant_id),
  tariff_key TEXT NOT NULL,
  tariff_version BIGINT NOT NULL,
  billing_basis TEXT NOT NULL CHECK (billing_basis IN ('single_application', 'multi_application')),
  max_applications INTEGER NOT NULL CHECK (
    (billing_basis = 'single_application' AND max_applications = 1) OR
    (billing_basis = 'multi_application' AND max_applications >= 2)
  ),
  accepted_amount NUMERIC(19,4) NOT NULL CHECK (accepted_amount >= 0),
  accepted_currency CHAR(3) NOT NULL CHECK (accepted_currency ~ '^[A-Z]{3}$'),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual', 'one_time')),
  assignment_status TEXT NOT NULL CHECK (assignment_status IN ('active', 'suspended', 'expired')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  FOREIGN KEY (tariff_key, tariff_version)
    REFERENCES eper_commercial_tariff_plan(tariff_key, tariff_version),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS eper_customer_tariff_effective_idx
  ON eper_customer_tariff_assignment (tenant_id, assignment_status, starts_at, ends_at);

COMMIT;
