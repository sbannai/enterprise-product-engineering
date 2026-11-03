-- Extend the provider-catalogue group role to tenant defaults and durable operations.
-- These tables are introduced by migrations 017-019 after the base role migration 016.
BEGIN;

GRANT SELECT, INSERT ON eper_tenant_provider_defaults TO eper_provider_catalogue_access;
GRANT UPDATE (defaults, version, updated_at, updated_by)
  ON eper_tenant_provider_defaults TO eper_provider_catalogue_access;

-- Application policy is an override read model. Writes remain on the approved
-- application workflow boundary; this service role only resolves it.
GRANT SELECT ON eper_application_provider_policies TO eper_provider_catalogue_access;

GRANT SELECT, INSERT ON eper_provider_operations TO eper_provider_catalogue_access;
GRANT UPDATE (
  operation_status, attempt_count, available_at, last_error_code, provider_reference,
  lease_owner, lease_expires_at, fencing_token, updated_at
) ON eper_provider_operations TO eper_provider_catalogue_access;

COMMIT;
