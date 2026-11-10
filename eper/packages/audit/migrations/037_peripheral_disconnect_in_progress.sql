-- Make physical adapter shutdown observable and retryable.
-- A peripheral is never reported SUSPENDED until adapter disconnect succeeds.
BEGIN;

ALTER TABLE eper_application_peripheral
  DROP CONSTRAINT IF EXISTS eper_application_peripheral_lifecycle_status_check;

ALTER TABLE eper_application_peripheral
  ADD CONSTRAINT eper_application_peripheral_lifecycle_status_check
  CHECK (lifecycle_status IN (
    'DRAFT','REGISTERED','CONFIGURED','ACTIVE','DEGRADED','OFFLINE',
    'DISCONNECTING','SUSPENDED','RETIRED'
  ));

COMMIT;
