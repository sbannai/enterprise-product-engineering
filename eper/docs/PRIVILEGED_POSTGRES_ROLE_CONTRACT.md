# Privileged PostgreSQL runtime-role contract

**Status:** executable CI contract. It proves the declared permission model against disposable PostgreSQL; it does not prove production credentials, memberships, ownership, or secret custody have been provisioned.

## Group roles and migrations

- Migration `016_privileged_database_access_roles.sql` creates `eper_platform_admin_access` and `eper_provider_catalogue_access` as NOLOGIN, non-superuser, non-creator, non-replication, NOINHERIT and NOBYPASSRLS group roles.
- Migration `020_provider_dispatch_access_roles.sql` extends the provider role to tenant defaults, application-policy reads and provider-operation queue/lease updates.
- Migrations 017–019 create tenant defaults, opaque operation payload references and operation leases/fencing in that order.

Create separate runtime login identities out of band and grant only group membership:

```sql
CREATE ROLE eper_platform_admin_runtime LOGIN INHERIT;
GRANT eper_platform_admin_access TO eper_platform_admin_runtime;

CREATE ROLE eper_provider_catalogue_runtime LOGIN INHERIT;
GRANT eper_provider_catalogue_access TO eper_provider_catalogue_runtime;
```

Provision credentials through the approved secret manager and configure `EPER_PLATFORM_ADMIN_DATABASE_URL` and `EPER_PROVIDER_CATALOGUE_DATABASE_URL` separately. Do not grant direct table privileges to these login roles. The API checks that each connected login is a member of its expected group, can log in, is not superuser, does not bypass RLS, and does not own protected tables.

## Permission boundary

- Platform Admin can select/insert hashed credentials and update only `last_used_at` and `revoked_at`. It can append audit events and update only the audit chain-head hash/timestamp.
- Provider catalogue can select/insert provider definitions, tenant-scoped connections and bindings, validation events, tenant defaults and provider operations. It receives column-level UPDATE only for the mutable status/version/lease/policy fields required by those repositories. It can SELECT application policy overrides but cannot write them.
- Both roles can INSERT append-only audit events. Neither can UPDATE/DELETE/TRUNCATE audit events or INSERT/DELETE/TRUNCATE the audit chain head.
- Neither role can access payment orders, receipts, webhook events, or the other role's business tables. Neither receives DELETE/TRUNCATE on provider records.
- Provider connections, bindings, validation events, tenant defaults, application policies and provider operations retain FORCE RLS. The provider login must not own these tables or have BYPASSRLS.

## CI verification

The PostgreSQL payment integration workflow creates disposable INHERIT login roles, grants membership in the two group roles, and supplies separate test URLs. The contract test verifies group membership, table-level permissions and column-level UPDATE grants. The operations test exercises credential issue/resolve/revoke, provider catalogue create/update/suspend, audit append and rollback on audit failure under the actual runtime login roles.

The tests must execute, not skip, before claiming a permission-contract pass. The disposable credentials are not production secrets. Production role provisioning and independent database-owner review remain separate deployment prerequisites.

No production roles, passwords, databases or cloud resources are provisioned by this PR. No external provider dispatch or Business UAT is authorized.
