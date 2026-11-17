-- Platform-owned peripheral type catalogue with immutable, versioned schemas.
-- Customer-owned instances remain in eper_application_peripheral.
BEGIN;

-- One additional least-privilege permission is now supported by durable credentials.
ALTER TABLE eper_platform_admin_credentials
  DROP CONSTRAINT IF EXISTS eper_platform_admin_credentials_permissions_check;
ALTER TABLE eper_platform_admin_credentials
  ADD CONSTRAINT eper_platform_admin_credentials_permissions_check
  CHECK (jsonb_typeof(permissions) = 'array' AND jsonb_array_length(permissions) BETWEEN 1 AND 6);

CREATE TABLE IF NOT EXISTS eper_peripheral_type_definitions (
  type_key TEXT PRIMARY KEY CHECK (type_key ~ '^[a-z][a-z0-9_.-]{1,95}$'),
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
  lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (lifecycle_status IN ('ACTIVE', 'DEPRECATED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 128),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128)
);

CREATE TABLE IF NOT EXISTS eper_peripheral_type_schema_versions (
  type_key TEXT NOT NULL REFERENCES eper_peripheral_type_definitions(type_key),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  adapter_key TEXT NOT NULL CHECK (adapter_key ~ '^[a-z][a-z0-9_.-]{1,95}$'),
  adapter_version TEXT NOT NULL CHECK (length(btrim(adapter_version)) BETWEEN 1 AND 64),
  configuration_schema JSONB NOT NULL CHECK (
    jsonb_typeof(configuration_schema) = 'object'
    AND configuration_schema->>'type' = 'object'
    AND NOT (configuration_schema ? '$ref')
  ),
  compatibility JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(compatibility) = 'object'),
  version_status TEXT NOT NULL CHECK (version_status IN ('DRAFT', 'PUBLISHED', 'DEPRECATED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 128),
  PRIMARY KEY (type_key, schema_version)
);

CREATE INDEX IF NOT EXISTS eper_peripheral_type_schema_published_idx
  ON eper_peripheral_type_schema_versions(type_key, schema_version DESC)
  WHERE version_status = 'PUBLISHED';

CREATE TABLE IF NOT EXISTS eper_peripheral_type_catalogue_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key TEXT NOT NULL REFERENCES eper_peripheral_type_definitions(type_key),
  schema_version INTEGER,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'TYPE_CREATED', 'TYPE_DEPRECATED', 'SCHEMA_DRAFTED', 'SCHEMA_PUBLISHED', 'SCHEMA_DEPRECATED'
  )),
  actor_id TEXT NOT NULL CHECK (length(btrim(actor_id)) BETWEEN 1 AND 128),
  correlation_id TEXT NOT NULL CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 128),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  FOREIGN KEY (type_key, schema_version)
    REFERENCES eper_peripheral_type_schema_versions(type_key, schema_version)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS eper_peripheral_type_catalogue_events_type_idx
  ON eper_peripheral_type_catalogue_events(type_key, occurred_at DESC);

CREATE OR REPLACE FUNCTION eper_reject_peripheral_type_schema_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'EPER_PERIPHERAL_TYPE_SCHEMA_VERSION_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS eper_peripheral_type_schema_immutable ON eper_peripheral_type_schema_versions;
CREATE TRIGGER eper_peripheral_type_schema_immutable
  BEFORE UPDATE OR DELETE ON eper_peripheral_type_schema_versions
  FOR EACH ROW EXECUTE FUNCTION eper_reject_peripheral_type_schema_mutation();

CREATE OR REPLACE FUNCTION eper_reject_peripheral_type_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'EPER_PERIPHERAL_TYPE_CATALOGUE_EVENT_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS eper_peripheral_type_catalogue_events_append_only ON eper_peripheral_type_catalogue_events;
CREATE TRIGGER eper_peripheral_type_catalogue_events_append_only
  BEFORE UPDATE OR DELETE ON eper_peripheral_type_catalogue_events
  FOR EACH ROW EXECUTE FUNCTION eper_reject_peripheral_type_event_mutation();

ALTER TABLE eper_peripheral_type_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_peripheral_type_definitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_peripheral_type_definitions_platform_admin ON eper_peripheral_type_definitions;
CREATE POLICY eper_peripheral_type_definitions_platform_admin
  ON eper_peripheral_type_definitions
  USING (current_setting('eper.platform_admin', true) = 'true')
  WITH CHECK (current_setting('eper.platform_admin', true) = 'true');

ALTER TABLE eper_peripheral_type_schema_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_peripheral_type_schema_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_peripheral_type_schema_platform_admin ON eper_peripheral_type_schema_versions;
CREATE POLICY eper_peripheral_type_schema_platform_admin
  ON eper_peripheral_type_schema_versions
  USING (current_setting('eper.platform_admin', true) = 'true')
  WITH CHECK (current_setting('eper.platform_admin', true) = 'true');
DROP POLICY IF EXISTS eper_peripheral_type_schema_published_read ON eper_peripheral_type_schema_versions;
CREATE POLICY eper_peripheral_type_schema_published_read
  ON eper_peripheral_type_schema_versions FOR SELECT
  USING (version_status = 'PUBLISHED');

ALTER TABLE eper_peripheral_type_catalogue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_peripheral_type_catalogue_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_peripheral_type_catalogue_events_platform_admin ON eper_peripheral_type_catalogue_events;
CREATE POLICY eper_peripheral_type_catalogue_events_platform_admin
  ON eper_peripheral_type_catalogue_events
  USING (current_setting('eper.platform_admin', true) = 'true')
  WITH CHECK (current_setting('eper.platform_admin', true) = 'true');

COMMIT;
