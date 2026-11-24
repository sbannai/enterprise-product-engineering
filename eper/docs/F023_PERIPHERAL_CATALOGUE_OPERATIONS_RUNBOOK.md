# F-023 — Application Peripheral Catalogue Operations Runbook

**Status:** Local and integration operations contract. This document does not authorize production deployment, cloud provisioning, or Business UAT.

## 1. Scope and operating boundary

F-023 binds immutable application peripheral configuration snapshots to published, versioned platform peripheral catalogue schemas.

- Feature flag: `EPER_APPLICATION_PERIPHERAL_API_ENABLED=true`.
- Application and catalogue-read pools are mandatory when enabled.
- Catalogue administration uses a separate optional connection.

PostgreSQL is approved for local development and integration testing. Do not provision chargeable cloud database resources.

## 2. Migration inventory

| Migration | Purpose |
|---|---|
| `034_application_peripherals.sql` | Application peripheral registration and immutable configuration snapshots with tenant/application RLS |
| `057_peripheral_type_catalogue.sql` | Platform peripheral definitions, versioned schemas and lifecycle |
| `058_peripheral_type_catalogue_access_role.sql` | Catalogue administration group role |
| `060_application_peripheral_catalogue_binding.sql` | Catalogue binding, foreign key, index and published-schema reader role/policy |
| `061_application_peripheral_access_role.sql` | Application peripheral runtime group role |

Migrations 060 and 061 are additive. Existing snapshots remain unbound until explicitly configured against a catalogue schema.

Apply migrations only to an approved local or disposable integration database, after confirming the target:

```bash
npm run migrate:audit
```

## 3. Database role model

| Purpose | Group role | Environment variable |
|---|---|---|
| Application runtime | `eper_application_peripheral_access` | `EPER_APPLICATION_PERIPHERAL_DATABASE_URL` |
| Published catalogue reader | `eper_peripheral_type_catalogue_read_access` | `EPER_PERIPHERAL_TYPE_CATALOGUE_READ_DATABASE_URL` |
| Optional catalogue administration | `eper_peripheral_type_catalogue_access` | `EPER_PERIPHERAL_TYPE_CATALOGUE_DATABASE_URL` |

Migrations create NOLOGIN group roles, not login credentials. Application runtime and catalogue-read connections are mandatory when the API is enabled. Catalogue administration is optional and separate.

## 4. Operator provisioning

After migrations are applied to the approved local or disposable database, a database operator creates separate LOGIN roles and grants membership in the corresponding NOLOGIN group roles.

Example login names:

- `eper_application_peripheral_login` → `eper_application_peripheral_access`
- `eper_peripheral_catalogue_read_login` → `eper_peripheral_type_catalogue_read_access`
- `eper_peripheral_catalogue_admin_login` → `eper_peripheral_type_catalogue_access` (optional)

Use separate credentials for each connection. Establish and rotate passwords through the approved secret-management process. Never store credentials in migrations, source control, shell history, chat or CI logs.

Do not reuse the general payment login. Do not grant SUPERUSER, BYPASSRLS, CREATEROLE, CREATEDB or ownership of protected tables to these logins.

The catalogue-read login must not be a member of, or able to SET ROLE to, the catalogue-admin group role.

## 5. Runtime configuration and startup checks

When `EPER_APPLICATION_PERIPHERAL_API_ENABLED=true`, configure these two dedicated connection variables:

- `EPER_APPLICATION_PERIPHERAL_DATABASE_URL`
- `EPER_PERIPHERAL_TYPE_CATALOGUE_READ_DATABASE_URL`

Configure `EPER_PERIPHERAL_TYPE_CATALOGUE_DATABASE_URL` only when catalogue administration is enabled.

The application also requires its existing PostgreSQL-backed customer identity, actor assignment, durable audit and module entitlement dependencies.

At startup, EPER validates the expected group-role membership and SET ROLE capability for each dedicated login. It rejects invalid role attributes and protected-table ownership. The catalogue reader is explicitly rejected if it can assume the catalogue-admin role.

The application, catalogue-read and optional catalogue-admin pools must resolve to the same PostgreSQL database and primary server endpoint. Startup rejects mismatched or unverifiable database identities and replicas.

There is no fallback from these dedicated F-023 URLs to `DATABASE_URL` or the general payment pool for peripheral persistence and catalogue reads.

Keep connection strings and credentials out of source control, terminal output, CI logs and application diagnostics.

## 6. Deployment preflight

Before enabling F-023 in a local or disposable integration environment, verify:

- [ ] The target is the intended local or disposable PostgreSQL database.
- [ ] Required baseline migrations, 060 and 061, are applied and recorded in the migration ledger.
- [ ] Migration repeatability has been verified.
- [ ] Dedicated application and catalogue-read LOGIN roles exist.
- [ ] Each login has only its required group-role membership and SET capability.
- [ ] The catalogue reader cannot assume the catalogue-admin role.
- [ ] Role attributes, ownership and table/column grants satisfy the least-privilege contract.
- [ ] Both required connection variables are configured securely.
- [ ] All configured pools resolve to the same primary database identity.
- [ ] Tenant/application RLS, published-schema visibility, configuration immutability and audit rollback tests pass.
- [ ] The feature remains disabled in environments that have not completed preflight.

A successful build or unit test run does not prove that database roles, migrations, RLS policies or deployment credentials are correctly provisioned.

## 7. Validation evidence

Run the focused code-level tests from this package:

```bash
npm run build
node --test tests/postgres-peripheral-repository.test.mjs tests/peripheral-catalogue-database-identity.test.mjs tests/peripheral-type-catalogue-runtime-composition.test.mjs tests/peripheral-type-catalogue-migration.test.mjs tests/postgres-peripheral-type-catalogue-resolver.test.mjs
```

These tests do not replace live PostgreSQL integration evidence using disposable dedicated logins. Before claiming the database permission contract is validated, retain evidence for actual migration application/repeatability, role grants, RLS isolation, published-schema visibility, reader/admin separation, concurrency, immutable history and audit rollback.

## 8. Failure handling and rollback

### Startup or readiness failure

1. Keep `EPER_APPLICATION_PERIPHERAL_API_ENABLED=false`.
2. Do not bypass startup checks, RLS, role membership or database identity validation.
3. Verify the database target, migration ledger, login membership, role attributes and grants through the approved operator workflow.
4. Correct the local or disposable environment and rerun focused tests before enabling the feature.

Never resolve permission failures by granting SUPERUSER, BYPASSRLS, table ownership or broad UPDATE/DELETE privileges.

### Credential or access incident

1. Disable the feature.
2. Revoke the affected login's group-role membership.
3. Rotate or revoke its credential through the approved secret-management process.
4. Review database access and audit evidence.
5. Re-provision a restricted login only after the cause is understood and reviewed.

### Application and schema rollback

Disable the API with `EPER_APPLICATION_PERIPHERAL_API_ENABLED=false` and use the authorized application rollback process.

Do not automatically reverse migrations 060 or 061. Migration 060 adds a foreign key to catalogue schema versions and preserves existing configuration data. Migration 061 creates a shared group role. Any schema rollback requires dependency review, a forward-safe recovery plan and explicit database-owner approval.

Configuration rollback must preserve immutable history: create a new configuration version and move the active pointer through the supported service workflow. Never rewrite or delete historical snapshots.

## 9. Release and authorization boundary

This runbook makes F-023 setup reproducible from repository documentation; it does not establish production readiness.

No production database migration, production credential provisioning, cloud resource creation, production deployment, provider activation or Business UAT is authorized by this document.

The approved 228-requirement baseline and existing acceptance criteria remain authoritative. Business UAT remains unauthorized until all required entry gates and requirement-level evidence are independently satisfied and explicitly approved.
