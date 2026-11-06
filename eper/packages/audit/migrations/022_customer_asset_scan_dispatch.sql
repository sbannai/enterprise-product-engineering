-- Durable, tenant/application-scoped malware scan dispatch queue.
-- Jobs are enqueued in the same transaction as upload completion; no worker or
-- external scanner is provisioned by this migration.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_customer_asset_scan_jobs (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  upload_session_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  correlation_id varchar(128) NOT NULL CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 128),
  state varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'leased', 'completed', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner varchar(128),
  lease_expires_at timestamptz,
  last_error_code varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, upload_session_id),
  FOREIGN KEY (tenant_id, upload_session_id)
    REFERENCES eper_customer_asset_upload_sessions (tenant_id, upload_session_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, asset_id)
    REFERENCES eper_customer_assets (tenant_id, asset_id)
    ON DELETE RESTRICT,
  CHECK (
    (state = 'leased' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (state <> 'leased' AND lease_owner IS NULL AND lease_expires_at IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS eper_customer_asset_scan_jobs_due_idx
  ON eper_customer_asset_scan_jobs (tenant_id, application_id, available_at, created_at)
  WHERE state IN ('pending', 'leased');
CREATE INDEX IF NOT EXISTS eper_customer_asset_scan_jobs_dead_letter_idx
  ON eper_customer_asset_scan_jobs (tenant_id, application_id, updated_at DESC)
  WHERE state = 'dead_letter';

ALTER TABLE eper_customer_asset_scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_customer_asset_scan_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_asset_scan_job_application_isolation ON eper_customer_asset_scan_jobs;
CREATE POLICY customer_asset_scan_job_application_isolation ON eper_customer_asset_scan_jobs
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON eper_customer_asset_scan_jobs TO eper_customer_asset_access;
COMMIT;
