-- Bind an active peripheral configuration to the exact adapter identity
-- recorded on its parent registration. This prevents activating a configuration
-- whose adapter key/version differs from the adapter resolved by the runtime.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS eper_application_peripheral_configuration_adapter_uq
  ON eper_application_peripheral_configuration
    (tenant_id, application_id, peripheral_id, configuration_version, adapter_key, adapter_version);

ALTER TABLE eper_application_peripheral
  DROP CONSTRAINT IF EXISTS eper_application_peripheral_active_configuration_fk;

ALTER TABLE eper_application_peripheral
  ADD CONSTRAINT eper_application_peripheral_active_configuration_adapter_fk
  FOREIGN KEY (
    tenant_id, application_id, peripheral_id, active_configuration_version,
    adapter_key, adapter_version
  )
  REFERENCES eper_application_peripheral_configuration (
    tenant_id, application_id, peripheral_id, configuration_version,
    adapter_key, adapter_version
  )
  DEFERRABLE INITIALLY DEFERRED;

COMMIT;
