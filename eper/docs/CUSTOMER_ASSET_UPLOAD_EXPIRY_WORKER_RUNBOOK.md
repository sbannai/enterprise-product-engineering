# Customer asset upload-expiry worker runbook

## Purpose and safety boundary

The worker expires abandoned upload reservations and appends the matching audit event. It does not read customer file bytes, contact a storage provider, dispatch scanner work, or alter payment/provider records.

The worker remains disabled by default. Do not enable it in production or UAT until the required database role, tenant registry, process supervision, and owner-approved alert thresholds are in place. This runbook does not authorize cloud provisioning or Business UAT.

## Database role and connection

Apply the audit migrations through 029 before configuring the worker.

The migration creates `eper_customer_asset_upload_expiry_worker_access` as a NOLOGIN, NOSUPERUSER, NOBYPASSRLS group role. It can:
- Execute `eper_expire_customer_asset_upload_sessions(tenant, limit)`, which requires the caller's already-bound tenant context.
- Insert append-only audit events.
- Read the single audit chain head and update only its hash/timestamp fields.

It cannot directly read or update upload sessions, asset metadata, application links, scan jobs, payment tables, or provider connections/secrets. The function owner is a separate NOLOGIN/NOBYPASSRLS role with a tenant-only RLS policy; the worker role cannot assume that owner role.

A database operator must provision a dedicated login role outside application migrations and grant it membership in the worker access role. Do not reuse the payment login or a superuser. Store the login credential in the deployment secret manager; never place it in source control or logs.

Example membership grant (replace the placeholder with the operator-provisioned login role):

```sql
GRANT eper_customer_asset_upload_expiry_worker_access
  TO <operator_provisioned_expiry_worker_login>;
```

The login must inherit the granted worker-role privileges. Verify it cannot assume privileged roles and has no direct grants on asset, payment, or provider tables.

Set `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL` to that dedicated login's PostgreSQL URL. The worker has no fallback to `DATABASE_URL` or `EPER_PAYMENT_DATABASE_URL`.

## Controlled tenant registry

Set `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPES_JSON` to an operator-managed JSON array of one seed application per tenant:

```json
[
  { "tenantId": "tenant-a", "applicationId": "app-a", "environment": "uat" },
  { "tenantId": "tenant-b", "applicationId": "app-b", "environment": "production" }
]
```

- One entry per tenant; duplicate tenant IDs are rejected.
- Maximum 10 tenant entries.
- Tenant/application IDs must match the repository identifier format.
- Environment must be `production`, `uat`, or `sandbox`.
- The seed application establishes the normal RLS tenant context. The expiry function can then process expired sessions across applications only within that same tenant.
- The registry is trusted deployment configuration, not an API input. Review and change it through the normal deployment/configuration approval process.

## Configuration

Required:
- `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED=true` (otherwise startup fails closed)
- `EPER_CUSTOMER_ASSET_PERSISTENCE=postgres`
- `EPER_AUDIT_PERSISTENCE=postgres`
- `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL`
- `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPES_JSON`

Optional bounded settings:
- `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POOL_MAX`: 1–10, default 2
- `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POLL_INTERVAL_MS`: 100–60,000, default 5,000
- `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_BATCH_SIZE`: 1–500, default 100
- `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_HEALTH_PORT`: 1–65,535, default 8081
- Dedicated pool connection, idle, statement, query, lock and idle-in-transaction timeouts are bounded by the runtime factory.

## Health and supervision

The process exposes:
- `GET /health/live`: 200 while the process is alive and not shutting down.
- `GET /health/ready`: 200 only after the asset schema and append-only audit store pass readiness checks; otherwise 503.

Bind health checks to the deployment's internal network. Health responses contain only a generic status; they do not disclose tenant IDs, application IDs, session IDs, database errors, or secrets.

Run under an external process supervisor with restart-on-failure and bounded restart backoff. The process handles SIGINT/SIGTERM by marking readiness false, aborting worker loops, waiting for bounded database operations to finish, closing the health listener, and closing the pool. Database statement/query/lock timeouts bound in-flight work.

## Metrics and alerts

Structured logs include only:
- scope index (not tenant/application identifiers)
- expired count
- oldest processed expiry queue age in milliseconds
- batch duration in milliseconds
- cumulative failure count

They do not include database error text, provider details, customer payload, session identifiers, or credentials.

Proposed starting alert thresholds (not owner-approved): readiness unavailable for more than 60 seconds; repeated database failures (3 or more within 5 minutes); oldest expiry queue age above 15 minutes for 3 consecutive batches. The service owner/operations owner must approve or replace these thresholds before paging is enabled.

## Rollout

1. Apply migrations through 029 in a non-production PostgreSQL environment.
2. Provision the dedicated login and grant only the worker access group role.
3. Run the privilege contract: worker function execution and audit append succeed; direct asset/session, payment and provider reads/writes fail.
4. Configure one or more approved tenant scopes and keep the enable flag false.
5. Start the process in disabled mode to confirm fail-closed startup; then enable only in the approved environment.
6. Confirm `/health/live` and `/health/ready`, bounded batches, audit events and redacted metrics.
7. Review queue age, failure count, and audit-chain readiness before expanding the registry.

## Incident recovery and rollback

- If readiness fails, inspect deployment/schema/role configuration through the approved database operator workflow. Do not grant broad table access or disable RLS.
- If queue age rises, verify process health, registry coverage, DB connection availability and audit append readiness. Do not manually update upload-session status outside the repository/function path.
- On repeated failures, set the enable flag false and restart under the supervisor. Expired sessions remain durable and can be processed after recovery.
- Preserve terminal session history and audit events. Do not delete sessions to clear an active-asset uniqueness conflict.
- No cloud resources, external storage provider calls, scanner dispatch, or Business UAT are part of this worker's recovery path.
