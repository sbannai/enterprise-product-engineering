-- Customer tariff switching: explicit acceptance metadata and immutable assignment history.
BEGIN;

ALTER TABLE eper_customer_tariff_assignment
  ADD COLUMN IF NOT EXISTS accepted_by TEXT,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acceptance_reference TEXT;

CREATE TABLE IF NOT EXISTS eper_customer_tariff_assignment_history (
  history_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  assignment_version BIGINT NOT NULL CHECK (assignment_version > 0),
  tariff_key TEXT NOT NULL,
  tariff_version BIGINT NOT NULL,
  billing_basis TEXT NOT NULL CHECK (billing_basis IN ('single_application', 'multi_application')),
  max_applications INTEGER NOT NULL CHECK (max_applications > 0),
  accepted_amount NUMERIC(19,4) NOT NULL CHECK (accepted_amount >= 0),
  accepted_currency CHAR(3) NOT NULL CHECK (accepted_currency ~ '^[A-Z]{3}$'),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual', 'one_time')),
  assignment_status TEXT NOT NULL CHECK (assignment_status IN ('active', 'suspended', 'expired')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  accepted_by TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL,
  acceptance_reference TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, assignment_version),
  FOREIGN KEY (tariff_key, tariff_version)
    REFERENCES eper_commercial_tariff_plan(tariff_key, tariff_version)
);

INSERT INTO eper_customer_tariff_assignment_history
  (tenant_id, assignment_version, tariff_key, tariff_version, billing_basis, max_applications,
   accepted_amount, accepted_currency, billing_interval, assignment_status, starts_at, ends_at,
   accepted_by, accepted_at, acceptance_reference)
SELECT tenant_id, version, tariff_key, tariff_version, billing_basis, max_applications,
       accepted_amount, accepted_currency, billing_interval, assignment_status, starts_at, ends_at,
       COALESCE(updated_by, 'legacy-migration'), COALESCE(updated_at, NOW()), 'legacy-existing-acceptance'
FROM eper_customer_tariff_assignment
ON CONFLICT (tenant_id, assignment_version) DO NOTHING;

COMMIT;
