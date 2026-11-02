-- Provider catalogue, tenant connections and application-scoped provider operations.
-- Secrets are references only; this schema never stores provider credentials or tokens.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_provider_definitions (
  provider_key TEXT PRIMARY KEY CHECK (length(btrim(provider_key)) BETWEEN 1 AND 96),
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
  adapter_key TEXT NOT NULL CHECK (length(btrim(adapter_key)) BETWEEN 1 AND 128),
  adapter_version TEXT NOT NULL CHECK (length(btrim(adapter_version)) BETWEEN 1 AND 64),
  capabilities JSONB NOT NULL CHECK (jsonb_typeof(capabilities) = 'array'),
  auth_modes JSONB NOT NULL CHECK (jsonb_typeof(auth_modes) = 'array'),
  configuration_schema JSONB NOT NULL CHECK (jsonb_typeof(configuration_schema) = 'object'),
  provider_status TEXT NOT NULL CHECK (provider_status IN ('ACTIVE', 'SUSPENDED', 'DEPRECATED')),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128)
);

CREATE TABLE IF NOT EXISTS eper_provider_connections (
  tenant_id TEXT NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  connection_id UUID NOT NULL,
  provider_key TEXT NOT NULL REFERENCES eper_provider_definitions(provider_key),
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
  auth_mode TEXT NOT NULL CHECK (length(btrim(auth_mode)) BETWEEN 1 AND 64),
  secret_reference TEXT NOT NULL CHECK (length(btrim(secret_reference)) BETWEEN 1 AND 512),
  connection_status TEXT NOT NULL CHECK (connection_status IN ('PENDING_VALIDATION', 'ACTIVE', 'DEGRADED', 'SUSPENDED', 'REVOKED')),
  environment TEXT NOT NULL CHECK (environment IN ('development', 'sandbox', 'uat', 'production')),
  safe_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_metadata) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 128),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, connection_id),
  UNIQUE (tenant_id, connection_id, provider_key)
);
CREATE INDEX IF NOT EXISTS eper_provider_connections_lookup_idx
  ON eper_provider_connections (tenant_id, provider_key, connection_status);

CREATE TABLE IF NOT EXISTS eper_provider_connection_applications (
  tenant_id TEXT NOT NULL,
  application_id TEXT NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  connection_id UUID NOT NULL,
  provider_key TEXT NOT NULL,
  allowed_capabilities JSONB NOT NULL CHECK (jsonb_typeof(allowed_capabilities) = 'array'),
  binding_status TEXT NOT NULL CHECK (binding_status IN ('ACTIVE', 'SUSPENDED', 'REVOKED')),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, application_id, connection_id),
  FOREIGN KEY (tenant_id, connection_id, provider_key)
    REFERENCES eper_provider_connections (tenant_id, connection_id, provider_key)
);
CREATE INDEX IF NOT EXISTS eper_provider_connection_applications_scope_idx
  ON eper_provider_connection_applications (tenant_id, application_id, binding_status);

CREATE TABLE IF NOT EXISTS eper_application_provider_policies (
  tenant_id TEXT NOT NULL,
  application_id TEXT NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  connection_id UUID NOT NULL,
  policy JSONB NOT NULL CHECK (jsonb_typeof(policy) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, application_id, connection_id),
  FOREIGN KEY (tenant_id, application_id, connection_id)
    REFERENCES eper_provider_connection_applications (tenant_id, application_id, connection_id)
);

CREATE TABLE IF NOT EXISTS eper_provider_operations (
  operation_id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  connection_id UUID NOT NULL,
  capability_key TEXT NOT NULL CHECK (length(btrim(capability_key)) BETWEEN 1 AND 128),
  capability_version TEXT NOT NULL CHECK (length(btrim(capability_version)) BETWEEN 1 AND 64),
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  correlation_id TEXT NOT NULL CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 128),
  operation_status TEXT NOT NULL CHECK (operation_status IN ('QUEUED', 'DISPATCHING', 'RETRYING', 'SUCCEEDED', 'FAILED', 'NEEDS_ATTENTION', 'CANCELLED')),
  request_digest TEXT NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  provider_reference TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, application_id, connection_id, idempotency_key),
  FOREIGN KEY (tenant_id, application_id, connection_id)
    REFERENCES eper_provider_connection_applications (tenant_id, application_id, connection_id)
);
CREATE INDEX IF NOT EXISTS eper_provider_operations_dispatch_idx
  ON eper_provider_operations (operation_status, available_at, created_at);
CREATE INDEX IF NOT EXISTS eper_provider_operations_scope_idx
  ON eper_provider_operations (tenant_id, application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS eper_provider_webhook_receipts (
  receipt_id UUID PRIMARY KEY,
  provider_key TEXT NOT NULL REFERENCES eper_provider_definitions(provider_key),
  provider_event_id TEXT NOT NULL CHECK (length(btrim(provider_event_id)) BETWEEN 1 AND 256),
  operation_id UUID REFERENCES eper_provider_operations(operation_id),
  tenant_id TEXT,
  application_id TEXT,
  signature_valid BOOLEAN NOT NULL,
  payload_digest TEXT NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
  processing_status TEXT NOT NULL CHECK (processing_status IN ('RECEIVED', 'PROCESSED', 'REJECTED', 'QUARANTINED')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (provider_key, provider_event_id)
);
CREATE INDEX IF NOT EXISTS eper_provider_webhook_receipts_pending_idx
  ON eper_provider_webhook_receipts (processing_status, received_at)
  WHERE processing_status IN ('RECEIVED', 'QUARANTINED');

COMMIT;
