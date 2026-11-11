-- DISCONNECTING represents a configured adapter that may still be connected.
-- Preserve the same adapter/configuration integrity required by ACTIVE/DEGRADED/OFFLINE.
BEGIN;

ALTER TABLE eper_application_peripheral
  ADD CONSTRAINT eper_application_peripheral_disconnecting_configuration_check
  CHECK (
    lifecycle_status <> 'DISCONNECTING'
    OR (adapter_key IS NOT NULL AND adapter_version IS NOT NULL
        AND active_configuration_version IS NOT NULL)
  );

COMMIT;
