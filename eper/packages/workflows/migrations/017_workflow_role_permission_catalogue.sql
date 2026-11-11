-- Extend the application role catalogue to persist every permission enforced by the API.
-- Forward-only: preserve migration 004 for databases where it has already been applied.
BEGIN;

ALTER TABLE eper_workflow_role_definition
  DROP CONSTRAINT IF EXISTS eper_workflow_role_definition_permissions_check;

ALTER TABLE eper_workflow_role_definition
  ADD CONSTRAINT eper_workflow_role_definition_permissions_check
  CHECK (
    jsonb_typeof(permissions) = 'array'
    AND jsonb_array_length(permissions) BETWEEN 1 AND 24
    AND permissions <@ '[
      "workflow:view",
      "workflow:act",
      "workflow:approve",
      "workflow:admin",
      "role:assign",
      "access:manage",
      "provider.connection.create",
      "provider.connection.read",
      "provider.connection.bind",
      "provider.connection.validate",
      "provider.connection.rotate",
      "provider.connection.revoke",
      "customer.asset.upload",
      "peripheral.register",
      "peripheral.configure",
      "peripheral.read",
      "peripheral.activate",
      "peripheral.suspend",
      "remote_desktop.session.request",
      "remote_desktop.consent.accept",
      "remote_desktop.control.grant",
      "remote_desktop.consent.revoke",
      "remote_desktop.session.start",
      "remote_desktop.session.stop"
    ]'::jsonb
  );

COMMIT;
