-- Application-owned peripheral registrations and immutable configuration history.
-- A row is owned by exactly one active tenant/application assignment.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_application_peripheral (
  tenant_id TEXT NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  application_id TEXT NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  peripheral_id UUID NOT NULL,
  peripheral_kind TEXT NOT NULL CHECK (peripheral_kind IN (
    'barcode_scanner','qr_reader','sensor','rfid_nfc','printer','weighing_scale','custom'
  )),
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
  adapter_key TEXT,
  adapter_version TEXT,
  lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (lifecycle_status IN (
    'DRAFT','REGISTERED','CONFIGURED','ACTIVE','DEGRADED','OFFLINE','SUSPENDED','RETIRED'
  )),
  active_configuration_version BIGINT,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 128),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, application_id, peripheral_id),
  FOREIGN KEY (tenant_id, application_id)
    REFERENCES eper_tenant_application_assignment (tenant_id, application_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (
    (adapter_key IS NULL) = (adapter_version IS NULL)
    AND (adapter_key IS NULL OR (
      length(btrim(adapter_key)) BETWEEN 2 AND 64
      AND adapter_version ~ '^\\d+\\.\\d+\\.\\d+
);

CREATE INDEX IF NOT EXISTS eper_application_peripheral_status_idx
  ON eper_application_peripheral (tenant_id, application_id, lifecycle_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS eper_application_peripheral_configuration (
  tenant_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  peripheral_id UUID NOT NULL,
  configuration_version BIGINT NOT NULL CHECK (configuration_version > 0),
  adapter_key TEXT NOT NULL CHECK (length(btrim(adapter_key)) BETWEEN 2 AND 64),
  adapter_version TEXT NOT NULL CHECK (adapter_version ~ '^\\d+\\.\\d+\\.\\d+$'),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  secret_reference TEXT CHECK (secret_reference IS NULL OR length(btrim(secret_reference)) BETWEEN 1 AND 512),
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, application_id, peripheral_id, configuration_version),
  FOREIGN KEY (tenant_id, application_id, peripheral_id)
    REFERENCES eper_application_peripheral (tenant_id, application_id, peripheral_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

ALTER TABLE eper_application_peripheral
  DROP CONSTRAINT IF EXISTS eper_application_peripheral_active_configuration_fk;
ALTER TABLE eper_application_peripheral
  ADD CONSTRAINT eper_application_peripheral_active_configuration_fk
  FOREIGN KEY (tenant_id, application_id, peripheral_id, active_configuration_version)
  REFERENCES eper_application_peripheral_configuration
    (tenant_id, application_id, peripheral_id, configuration_version)
  DEFERRABLE INITIALLY DEFERRED;

-- Configuration versions are immutable; changes create a new version.
CREATE OR REPLACE FUNCTION eper_reject_peripheral_configuration_mutation()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'EPER_PERIPHERAL_CONFIGURATION_IMMUTABLE'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;

DROP TRIGGER IF EXISTS eper_peripheral_configuration_no_update
  ON eper_application_peripheral_configuration;
CREATE TRIGGER eper_peripheral_configuration_no_update
BEFORE UPDATE OR DELETE ON eper_application_peripheral_configuration
FOR EACH ROW EXECUTE FUNCTION eper_reject_peripheral_configuration_mutation();

ALTER TABLE eper_application_peripheral ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_application_peripheral FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_application_peripheral_scope ON eper_application_peripheral;
CREATE POLICY eper_application_peripheral_scope ON eper_application_peripheral
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

ALTER TABLE eper_application_peripheral_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_application_peripheral_configuration FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_application_peripheral_configuration_scope
  ON eper_application_peripheral_configuration;
CREATE POLICY eper_application_peripheral_configuration_scope
  ON eper_application_peripheral_configuration
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

COMMIT;

    ))
    AND (active_configuration_version IS NULL OR adapter_key IS NOT NULL)
    AND (
      lifecycle_status NOT IN ('CONFIGURED','ACTIVE','DEGRADED','OFFLINE')
      OR (adapter_key IS NOT NULL AND active_configuration_version IS NOT NULL)
    )
    AND (
      lifecycle_status NOT IN ('DRAFT','REGISTERED')
      OR active_configuration_version IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS eper_application_peripheral_status_idx
  ON eper_application_peripheral (tenant_id, application_id, lifecycle_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS eper_application_peripheral_configuration (
  tenant_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  peripheral_id UUID NOT NULL,
  configuration_version BIGINT NOT NULL CHECK (configuration_version > 0),
  adapter_key TEXT NOT NULL CHECK (length(btrim(adapter_key)) BETWEEN 2 AND 64),
  adapter_version TEXT NOT NULL CHECK (adapter_version ~ '^\\d+\\.\\d+\\.\\d+$'),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  secret_reference TEXT CHECK (secret_reference IS NULL OR length(btrim(secret_reference)) BETWEEN 1 AND 512),
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, application_id, peripheral_id, configuration_version),
  FOREIGN KEY (tenant_id, application_id, peripheral_id)
    REFERENCES eper_application_peripheral (tenant_id, application_id, peripheral_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

ALTER TABLE eper_application_peripheral
  DROP CONSTRAINT IF EXISTS eper_application_peripheral_active_configuration_fk;
ALTER TABLE eper_application_peripheral
  ADD CONSTRAINT eper_application_peripheral_active_configuration_fk
  FOREIGN KEY (tenant_id, application_id, peripheral_id, active_configuration_version)
  REFERENCES eper_application_peripheral_configuration
    (tenant_id, application_id, peripheral_id, configuration_version)
  DEFERRABLE INITIALLY DEFERRED;

-- Configuration versions are immutable; changes create a new version.
CREATE OR REPLACE FUNCTION eper_reject_peripheral_configuration_mutation()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'EPER_PERIPHERAL_CONFIGURATION_IMMUTABLE'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;

DROP TRIGGER IF EXISTS eper_peripheral_configuration_no_update
  ON eper_application_peripheral_configuration;
CREATE TRIGGER eper_peripheral_configuration_no_update
BEFORE UPDATE OR DELETE ON eper_application_peripheral_configuration
FOR EACH ROW EXECUTE FUNCTION eper_reject_peripheral_configuration_mutation();

ALTER TABLE eper_application_peripheral ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_application_peripheral FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_application_peripheral_scope ON eper_application_peripheral;
CREATE POLICY eper_application_peripheral_scope ON eper_application_peripheral
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

ALTER TABLE eper_application_peripheral_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_application_peripheral_configuration FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_application_peripheral_configuration_scope
  ON eper_application_peripheral_configuration;
CREATE POLICY eper_application_peripheral_configuration_scope
  ON eper_application_peripheral_configuration
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

COMMIT;
