# Privileged PostgreSQL role contract

**Status:** deployment contract and executable permission assertions; not evidence that production roles have been provisioned.

The API uses separate connection strings for the platform-admin credential store and provider catalogue:

- `EPER_PLATFORM_ADMIN_DATABASE_URL`
- `EPER_PROVIDER_CATALOGUE_DATABASE_URL`

Each URL must authenticate as a distinct, pre-created, non-superuser, non-owner role. Do not use the payment/database owner, a migration role, or a role with `BYPASSRLS`. The application intentionally fails startup when an enabled privileged store has no dedicated URL. This contract does not create roles, passwords, secrets, databases, or cloud resources.

## Required grants

Run migrations first using the separately controlled migration owner. Then provision the roles out of band. Substitute the actual role names only after they have been approved and created.

```sql
-- Common grants for each runtime role:
REVOKE ALL ON TABLE public.eper_audit_events FROM PUBLIC;
REVOKE ALL ON TABLE public.eper_audit_chain_head FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO eper_platform_admin_runtime, eper_provider_catalogue_runtime;
GRANT INSERT ON TABLE public.eper_audit_events TO eper_platform_admin_runtime, eper_provider_catalogue_runtime;
GRANT SELECT, UPDATE ON TABLE public.eper_audit_chain_head TO eper_platform_admin_runtime, eper_provider_catalogue_runtime;

-- Platform-admin credential store:
GRANT SELECT, INSERT, UPDATE ON TABLE public.eper_platform_admin_credentials TO eper_platform_admin_runtime;

-- Provider catalogue:
GRANT SELECT, INSERT, UPDATE ON TABLE public.eper_provider_definitions TO eper_provider_catalogue_runtime;
```

The example role identifiers above are illustrative only. The grants are intentionally narrow: neither runtime role receives DELETE/TRUNCATE on its business table or UPDATE/DELETE/TRUNCATE on audit events. Do not grant either role access to payment orders, receipts, webhook events, customer identity/session records, tenant provider connections, or unrelated control-plane tables. The provider catalogue repository only owns the global provider-definition table; tenant/application connection data remains on its separately governed persistence path.

The audit writer uses a shared chain head. Each privileged role therefore needs SELECT and UPDATE on that singleton row plus INSERT on the append-only event table. The audit event UPDATE/DELETE triggers remain enabled. Runtime roles must not own these tables, disable triggers, or bypass row-level security.

## Executable verification

The test `tests/privileged-postgres-role-contract.integration.test.mjs` connects independently using:

- `EPER_PLATFORM_ADMIN_TEST_DATABASE_URL`
- `EPER_PROVIDER_CATALOGUE_TEST_DATABASE_URL`

It asserts each connection is non-superuser and cannot bypass RLS; confirms required table privileges; and rejects cross-store access, payment-table access, audit mutation, and table truncation. The tests skip when their respective URLs are absent. A skipped test is **not** a role-security pass.

Provide these test URLs only from an isolated local/CI PostgreSQL instance with migrations applied and actual distinct runtime roles provisioned. Never point these tests at production. Record the tested role names, migration revision, exact commit, and workflow artifact before claiming least-privilege proof.

## Remaining acceptance evidence

- Distinct role credentials provisioned and protected outside source control.
- The two integration tests execute (not skip) against real PostgreSQL.
- Actual store operations succeed under each runtime role.
- Cross-store and payment access are denied by PostgreSQL.
- Audit append succeeds while UPDATE/DELETE/TRUNCATE are denied.
- Failure injection proves each business mutation and its audit event roll back together.
- Ownership, inherited role memberships, PUBLIC grants, schema privileges and default privileges are reviewed by the database owner.

This contract is not a production grant script and does not authorize deployment or Business UAT.
