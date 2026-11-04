-- Customer-level asset repository foundation.
-- Stores metadata and opaque provider references only; binary bytes remain in an
-- external provider selected by an injected adapter. No cloud resources are created.
-- Runtime integration, upload dispatch, scanning and audited download remain separate
-- delivery steps and must not be inferred from this schema alone.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_customer_assets (
  tenant_id varchar(128) NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  asset_id uuid NOT NULL,
  repository_scope varchar(24) NOT NULL CHECK (repository_scope IN ('customer_shared', 'application_restricted')),
  owner_application_id varchar(128),
  display_name varchar(200) NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),
  original_file_name varchar(255) NOT NULL CHECK (length(btrim(original_file_name)) BETWEEN 1 AND 255),
  media_category varchar(16) NOT NULL CHECK (media_category IN ('image', 'video', 'document', 'other')),
  mime_type varchar(128) NOT NULL CHECK (length(btrim(mime_type)) BETWEEN 1 AND 128),
  file_extension varchar(16) NOT NULL CHECK (file_extension ~ '^[a-z0-9]{1,15}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 char(64) CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[a-f0-9]{64}$'),
  storage_adapter_key varchar(64) NOT NULL CHECK (length(btrim(storage_adapter_key)) BETWEEN 1 AND 64),
  storage_object_reference varchar(2048) NOT NULL CHECK (length(btrim(storage_object_reference)) BETWEEN 1 AND 2048),
  upload_status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (upload_status IN ('pending', 'uploaded', 'scanning', 'available', 'rejected', 'failed')),
  scan_status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('pending', 'clean', 'infected', 'error', 'not_required')),
  lifecycle_status varchar(16) NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'quarantined', 'deleted')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(128) NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_by varchar(128),
  deleted_at timestamptz,
  PRIMARY KEY (tenant_id, asset_id),
  CHECK (
    (repository_scope = 'customer_shared' AND owner_application_id IS NULL)
    OR (repository_scope = 'application_restricted' AND owner_application_id IS NOT NULL)
  ),
  CHECK (
    (lifecycle_status = 'deleted' AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
    OR (lifecycle_status <> 'deleted' AND deleted_at IS NULL AND deleted_by IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS eper_customer_assets_repository_idx
  ON eper_customer_assets (tenant_id, lifecycle_status, created_at DESC, asset_id);
CREATE INDEX IF NOT EXISTS eper_customer_assets_owner_application_idx
  ON eper_customer_assets (tenant_id, owner_application_id, lifecycle_status, created_at DESC)
  WHERE owner_application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS eper_customer_assets_scan_queue_idx
  ON eper_customer_assets (tenant_id, created_at, asset_id)
  WHERE upload_status IN ('uploaded', 'scanning') AND lifecycle_status = 'active';

-- Explicit application links are the only way a customer-shared asset becomes
-- available inside an application. A tenant-wide asset is not implicitly visible
-- to every application merely because both share a tenant.
CREATE TABLE IF NOT EXISTS eper_customer_asset_application_links (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  asset_id uuid NOT NULL,
  linked_by varchar(128) NOT NULL CHECK (length(btrim(linked_by)) BETWEEN 1 AND 128),
  link_reason varchar(64) NOT NULL CHECK (length(btrim(link_reason)) BETWEEN 1 AND 64),
  idempotency_key varchar(128) NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 16 AND 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, asset_id),
  UNIQUE (tenant_id, application_id, idempotency_key),
  FOREIGN KEY (tenant_id, asset_id)
    REFERENCES eper_customer_assets (tenant_id, asset_id)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS eper_customer_asset_links_asset_idx
  ON eper_customer_asset_application_links (tenant_id, asset_id, created_at DESC);

-- Upload sessions reserve metadata before bytes are transferred. Provider-specific
-- multipart/session tokens are stored only as opaque references, never credentials.
CREATE TABLE IF NOT EXISTS eper_customer_asset_upload_sessions (
  tenant_id varchar(128) NOT NULL,
  upload_session_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  actor_id varchar(128) NOT NULL CHECK (length(btrim(actor_id)) BETWEEN 1 AND 128),
  expected_size_bytes bigint NOT NULL CHECK (expected_size_bytes > 0),
  received_size_bytes bigint NOT NULL DEFAULT 0
    CHECK (received_size_bytes >= 0 AND received_size_bytes <= expected_size_bytes),
  provider_upload_reference varchar(2048),
  upload_status varchar(20) NOT NULL DEFAULT 'initiated'
    CHECK (upload_status IN ('initiated', 'in_progress', 'completed', 'aborted', 'expired', 'failed')),
  idempotency_key varchar(128) NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 16 AND 128),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, upload_session_id),
  UNIQUE (tenant_id, asset_id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, asset_id)
    REFERENCES eper_customer_assets (tenant_id, asset_id)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS eper_customer_asset_upload_expiry_idx
  ON eper_customer_asset_upload_sessions (expires_at, tenant_id)
  WHERE upload_status IN ('initiated', 'in_progress');

-- Enforce tenant isolation on every repository table. Application links and upload
-- sessions additionally require the application context to match. Customer-wide
-- repository reads use tenant context and still require service-layer actor checks.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'eper_customer_assets',
    'eper_customer_asset_application_links',
    'eper_customer_asset_upload_sessions'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

DROP POLICY IF EXISTS customer_asset_tenant_isolation ON eper_customer_assets;
CREATE POLICY customer_asset_tenant_isolation ON eper_customer_assets
  USING (tenant_id = current_setting('eper.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('eper.tenant_id', true));

DROP POLICY IF EXISTS customer_asset_application_link_isolation ON eper_customer_asset_application_links;
CREATE POLICY customer_asset_application_link_isolation ON eper_customer_asset_application_links
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

DROP POLICY IF EXISTS customer_asset_upload_session_isolation ON eper_customer_asset_upload_sessions;
CREATE POLICY customer_asset_upload_session_isolation ON eper_customer_asset_upload_sessions
  USING (tenant_id = current_setting('eper.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('eper.tenant_id', true));

COMMIT;
