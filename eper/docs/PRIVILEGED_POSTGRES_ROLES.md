# EPER privileged PostgreSQL roles

## Purpose

The Product Admin credential store and provider-catalogue/connection services must not use the general payment database credential. They use separate pools and separate login identities. Migration `016_privileged_database_access_roles.sql` creates two non-login group roles with explicit least-privilege grants:

- `eper_platform_admin_access`
- `eper_provider_catalogue_access`

Both roles are `NOLOGIN`, non-superuser, non-creator, non-replication and `NOBYPASSRLS`. The migration does not create passwords or provision cloud resources.

## Database operator provisioning

Run the audit migrations using the approved migration identity first:

```bash
npm run migrate:audit
```

Create separate login identities through the database secret/provisioning process. Do not reuse the application/payment login:

```sql
CREATE ROLE eper_platform_admin_login LOGIN;
GRANT eper_platform_admin_access TO eper_platform_admin_login;

CREATE ROLE eper_provider_catalogue_login LOGIN;
GRANT eper_provider_catalogue_access TO eper_provider_catalogue_login;
```

Set strong credentials through the approved secret manager/rotation process, then configure separate connection strings:

- `EPER_PLATFORM_ADMIN_DATABASE_URL` → `eper_platform_admin_login`
- `EPER_PROVIDER_CATALOGUE_DATABASE_URL` → `eper_provider_catalogue_login`

The API refuses to start the corresponding feature when its dedicated URL is missing, when the connected login is not a member of the expected group role, or when the connected role is superuser or bypasses RLS. There is no fallback to `DATABASE_URL` or the payment pool.

## Permission boundary

| Role | Allowed | Explicitly not granted |
|---|---|---|
| `eper_platform_admin_access` | Read/issue/revoke hashed Product Admin credentials; update only `last_used_at` and `revoked_at`; append audit events and advance the audit chain head | Credential delete; changing token hash, actor, permissions or expiry; audit event update/delete; provider catalogue access |
| `eper_provider_catalogue_access` | Manage provider definitions; read/create/update tenant-scoped provider connections and application bindings; read/append validation history; append audit events and advance the audit chain head | Provider definition/connection/binding delete; changing immutable identifiers; audit event update/delete; Product Admin credential access |

The shared audit chain grants are intentionally narrow: both roles can insert into `eper_audit_events`, read `eper_audit_chain_head`, and update only `last_event_hash` and `updated_at`. Existing append-only triggers continue to reject audit-event mutation.

Provider connection, application-binding and validation-history tables retain their existing `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` policies. The provider-catalogue login must not have `BYPASSRLS`; request transactions must continue to set `eper.tenant_id` and, where applicable, `eper.application_id`.

## Validation

Migration 016 is repeatable through the audit migration ledger. The live PostgreSQL privileged-role integration test checks role attributes, grants, column-level update limits, append-only audit access, successful tenant-scoped provider writes and cross-tenant RLS denial. It runs only against the disposable PostgreSQL database supplied to CI/developer verification.

## Operational guardrails

- Keep both dedicated login URLs disabled until the database operator has created the login roles, granted group membership, applied migrations and stored credentials securely.
- Rotate the two credentials independently.
- Do not grant either login `SUPERUSER`, `BYPASSRLS`, `CREATEROLE`, `CREATEDB`, or ownership of the protected tables.
- Do not use production secrets in CI. Integration tests use ephemeral PostgreSQL roles and synthetic records and roll back their transactions.
- No chargeable AWS resources, live provider dispatch or external CRM writes are part of this role contract.
