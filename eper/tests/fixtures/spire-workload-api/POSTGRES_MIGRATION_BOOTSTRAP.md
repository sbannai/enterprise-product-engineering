# Disposable PostgreSQL bootstrap — migration trace

Issue: #459  
Work branch: `test/459-local-scanner-child-composition`  
Scope: local/CI fixture only. No production DB, cloud resources, credentials or customer data.

## Verified migration runner contract

`scripts/migrate-audit.mjs` selects its connection string in this order:

1. `EPER_AUDIT_DATABASE_URL`
2. `EPER_PAYMENT_DATABASE_URL`
3. `DATABASE_URL`

It delegates to `runMigrations()` in `scripts/migrate-payments.mjs`, with:

- directory: `packages/audit/migrations`
- advisory lock: `eper:audit-schema-migrations`
- ledger: `eper_audit_schema_migrations`
- application name: `eper-audit-migrations`

The runner reads every filename matching `^\d{3}_[a-z0-9_]+\.sql$`, sorts names lexicographically, calculates SHA-256, rejects checksum drift for already-applied migrations, and applies each migration and its ledger insert in one transaction. It strips the standalone outer BEGIN/COMMIT wrappers only for this runner.

## Mainline migration inventory (57 files)

```text
001_audit_events.sql
002_admin_configuration.sql
003_ai_integration_admin_config.sql
003_customer_application_settings.sql
004_module_entitlements_pricing.sql
005_application_addon_entitlements.sql
006_agent_drafts.sql
007_actor_application_assignments.sql
008_tenant_application_assignments.sql
009_customer_commercial_controls.sql
010_commercial_tariff_admin_lifecycle.sql
011_customer_tariff_acceptance_history.sql
012_provider_configuration_foundation.sql
013_provider_validation_history.sql
014_provider_pending_validation_binding.sql
015_platform_admin_credentials.sql
016_privileged_database_access_roles.sql
017_tenant_provider_defaults.sql
018_provider_operation_payload_reference.sql
019_provider_operation_leases.sql
020_provider_dispatch_access_roles.sql
021_customer_asset_repository.sql
022_customer_asset_scan_dispatch.sql
023_customer_asset_upload_recovery.sql
024_customer_asset_upload_provider_outcomes.sql
025_customer_asset_metadata_idempotency.sql
026_customer_asset_shared_download_session_visibility.sql
027_customer_asset_upload_retry_lifecycle.sql
028_customer_asset_cross_application_expiry.sql
029_customer_asset_upload_expiry_worker_role.sql
030_customer_asset_upload_expiry_queue_age.sql
031_customer_asset_expiry_worker_tenant_scope.sql
032_customer_asset_upload_expected_checksum.sql
033_customer_asset_scan_claim_generation.sql
034_application_peripherals.sql
035_peripheral_remote_desktop_addons.sql
036_peripheral_active_adapter_consistency.sql
037_peripheral_disconnect_in_progress.sql
038_peripheral_disconnecting_configuration_guard.sql
039_remote_desktop_sessions_and_consent.sql
040_encrypted_provider_payload_store.sql
041_provider_payload_operation_integrity.sql
042_provider_payload_lifecycle_metadata.sql
043_provider_payload_envelope_v2.sql
044_provider_payload_tombstones.sql
045_customer_asset_upload_attempt_generations.sql
046_customer_asset_scan_child_readonly_input.sql
047_customer_asset_scan_supervisor_identity.sql
048_customer_asset_scan_supervisor_lease_renewal.sql
049_customer_asset_scan_supervisor_claim.sql
050_customer_asset_scan_supervisor_recovery.sql
051_vendor_dependency_inventory.sql
052_customer_asset_scan_child_spiffe_binding.sql
053_customer_asset_scan_child_provider_binding.sql
054_customer_asset_scan_child_authenticated_context.sql
055_customer_asset_scan_child_legacy_resolver_revocation.sql
056_customer_asset_scan_supervisor_recovery_error_context.sql
```

The duplicate `003` prefix is not a collision for this runner: both full filenames are sorted and tracked independently in the ledger.

## Scanner-specific schema dependencies confirmed

- `001`: append-only `eper_audit_events` and `eper_audit_chain_head`.
- `008`: `eper_tenant_application_assignment`, referenced by migration 051.
- `021`: asset, application-link and upload-session tables; RLS and base asset runtime role.
- `022`: durable scan-job table and RLS.
- `033`: monotonic scan claim-generation fencing token.
- `046`: dedicated child definer/access roles, LOGIN identity table, scoped read resolver and EXECUTE-only child role boundary.
- `047`–`050`: supervisor identity and recovery/claim lifecycle; required by the complete audit chain even though not directly invoked by the child process.
- `052`: adds exact SPIFFE identity binding and the seven-argument legacy resolver.
- `053`: pins provider connection to the authenticated scanner identity.
- `054`: introduces the session-user-derived two-argument context resolver.
- `055`: revokes the obsolete caller-parameterized resolver and leaves the context resolver as the supported child entry point.
- `056`: completes supervisor recovery error context and audit writer grants.

Migration 051 also references the tenant/application assignment table created by 008. No separate application-data or payment migration runner is needed for the specific scanner-child identity-to-asset schema path identified here; the audit runner is the schema authority for these tables.

## Fixture bootstrap sequence

1. Start only a disposable local PostgreSQL service with a fresh named volume and health check.
2. Build the EPER package in the fixture runtime and wait for PostgreSQL readiness.
3. Run `EPER_AUDIT_DATABASE_URL=<fixture-only URL> npm run migrate:audit`.
4. Assert exactly the expected 57 migration ledger rows and verify every stored checksum against the checked-in migration file.
5. Assert required scanner tables, functions, roles, policies and grants exist; fail if the context resolver signature is not exactly `(uuid, bigint)`.
6. Only then create the fixture LOGIN, grant membership in `eper_customer_asset_scan_child_access`, and insert its disabled-by-default synthetic identity binding. Enable it only after the SPIFFE entry and mTLS client-certificate mapping are ready.
7. Seed only synthetic tenant/application/asset/upload/job rows through an administrative fixture connection. The scanner LOGIN itself receives no direct source-table privileges.
8. Run positive and negative resolver tests over actual mTLS using the real child process.

## Important caution

The full audit runner applies all 57 audit migrations, not just scanner migrations. Therefore the disposable database must start empty and the runner must be allowed to fail loudly on any missing prerequisite or incompatible PostgreSQL version. Do not cherry-pick only migrations 001/008/021/022/033/046/052–056: that would not reproduce the authoritative mainline schema and would bypass the runner's migration ledger/checksum guarantees.

## Current evidence status

Static repository inspection completed. **No PostgreSQL migration execution has yet been performed by this branch**, and no mTLS scanner child end-to-end pass is claimed. Next code slice is to extend the existing local Compose fixture with PostgreSQL, a health gate, and an isolated migration/bootstrap script; then run and retain the exact output as CI evidence.
