-- Allow Customer Admins to bind a pending provider connection before validating it.
-- Validation then proves the binding belongs to this application; success activates it.
BEGIN;

ALTER TABLE eper_provider_connection_applications
  DROP CONSTRAINT IF EXISTS eper_provider_connection_applications_binding_status_check;

ALTER TABLE eper_provider_connection_applications
  ADD CONSTRAINT eper_provider_connection_applications_binding_status_check
  CHECK (binding_status IN ('PENDING_VALIDATION', 'ACTIVE', 'SUSPENDED', 'REVOKED'));

COMMIT;
