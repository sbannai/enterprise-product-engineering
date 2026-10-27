-- Add per-application AI integration controls to durable tenant admin configuration.
BEGIN;
ALTER TABLE eper_admin_configuration
  DROP CONSTRAINT IF EXISTS eper_admin_configuration_resource_type_check;
ALTER TABLE eper_admin_configuration
  ADD CONSTRAINT eper_admin_configuration_resource_type_check
  CHECK (resource_type IN ('workflows', 'roles-access', 'price-book', 'payment-vendor', 'ai-integrations'));
ALTER TABLE eper_admin_configuration
  DROP CONSTRAINT IF EXISTS eper_admin_configuration_check;
ALTER TABLE eper_admin_configuration
  ADD CONSTRAINT eper_admin_configuration_check CHECK (
    (resource_type IN ('workflows', 'roles-access', 'price-book') AND jsonb_typeof(config) = 'array') OR
    (resource_type = 'payment-vendor' AND jsonb_typeof(config) = 'object') OR
    (resource_type = 'ai-integrations' AND jsonb_typeof(config) = 'object')
  );
COMMIT;
