# Customer asset upload-expiry worker runbook

## Status and safety boundary

This worker is an opt-in, tenant-scoped background process. It expires abandoned upload-session metadata and appends an audit event. It does not read customer file bytes, contact a storage provider, invoke a scanner, or dispatch external work.

The worker remains disabled by default. Do not enable it for production or Business UAT until the deployment owner has approved the database role, tenant assignment, monitoring and recovery procedure. No cloud resources are required or provisioned by this runbook.

## Database role provisioning

Apply audit migrations through migration 029 using the normal schema-migration identity. Migration 028 creates the non-login group role `eper_customer_asset_upload_expiry_worker_access`; migration 027 creates the narrowly scoped security-definer function owner. Neither role can log in, become a superuser, or bypass RLS.

A database operator provisions a dedicated login identity using the platform's approved credential or workload-identity process. Example role membership only (do not put passwords or connection strings in SQL files):

```sql
CREATE ROLE eper_customer_asset_upload_expiry_worker_login LOGIN INHERIT;
GRANT eper_customer_asset_upload_expiry_worker_access
  TO eper_customer_asset_upload_expiry_worker_login;
```

The login identity must not be a member of the payment, API, provider, platform-admin, migration, or asset-runtime roles. It must not own application tables and must not have `BYPASSRLS`. Store its connection URI in the deployment secret manager and expose it only as `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL`.

The group role is limited to:
- Execute the tenant-bound upload-expiry and queue-age functions.
- Insert audit events.
- Read the audit-chain singleton and update only `last_event_hash` and `updated_at`.

It has no direct SELECT/UPDATE access to upload sessions, assets, scan jobs, payment tables, provider payloads, or audit event history. Do not widen these grants to make startup pass; investigate the migration and role membership instead.

## Tenant assignment and process topology

Run one worker process per tenant using a trusted deployment inventory. Set `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_TENANT_ID` and a designated in-tenant `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_APPLICATION_ID` from that inventory. These values must never come from an HTTP request, queue message, customer-controlled file, or arbitrary command-line argument.

The database function verifies that the session's existing tenant context equals its tenant argument before clearing only the application context. It can expire sessions across applications within that tenant, but cannot switch tenants. The repository rebinds the originating application context before appending each audit event. Direct cross-application reads remain denied.

Do not run multiple processes with the same tenant assignment unless the operator has intentionally configured horizontal concurrency. `FOR UPDATE SKIP LOCKED` makes bounded concurrent expiry idempotent, but pool and audit-chain contention still need to be monitored.

## Required configuration

- `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED=true` (explicit opt-in).
- `EPER_CUSTOMER_ASSET_PERSISTENCE=postgres`.
- `EPER_AUDIT_PERSISTENCE=postgres`.
- `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL` (dedicated login; no fallback is supported).
- `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_TENANT_ID`.
- `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_APPLICATION_ID`.
- Optional `EPER_AUDIT_ENVIRONMENT`: `sandbox`, `uat`, or `production`.
- Optional pool settings: `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POOL_MAX` (1–5, default 2), `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_CONNECTION_TIMEOUT_MS`, `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_IDLE_TIMEOUT_MS`, `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_STATEMENT_TIMEOUT_MS`, `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_QUERY_TIMEOUT_MS`, `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_LOCK_TIMEOUT_MS`, and `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_IDLE_TX_TIMEOUT_MS`.
- Optional work settings: `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POLL_INTERVAL_MS` (100–60,000, default 5,000), `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_BATCH_SIZE` (1–500, default 100).
- Optional alert settings: `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_QUEUE_AGE_ALERT_MS` (default 900,000) and `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_FAILURE_ALERT_THRESHOLD` (default 3).

Never print the database URI or its parsed username/password. The application logs only redacted event names, counts, durations, queue age and consecutive failure counts.

## Start and supervise

Build with `npm run build`, then start with `npm run start:customer-asset-upload-expiry-worker`.

Use the approved process supervisor (for example, systemd or an equivalent container supervisor) with:
- Restart on unexpected exit and a bounded restart delay.
- A termination grace period of at least 25 seconds to allow PostgreSQL statement/query timeouts and pool shutdown.
- Standard output/error collected by the approved log/metrics pipeline.
- No automatic restart loop for missing/invalid configuration; correct the deployment secret or config first.
- Only one active process per assigned tenant by default; use intentional concurrency after load validation.

The process emits `customer_asset_upload_expiry_worker_ready` only after asset and audit schema readiness checks pass. It emits `customer_asset_upload_expiry_batch_completed` with expired count, batch duration and oldest stale-session age; queue-age threshold crossing is marked `queueAgeAlert=true`. Repeated failures emit `customer_asset_upload_expiry_batch_failed`; the alert flag becomes true at the configured consecutive-failure threshold. SIGTERM/SIGINT causes the worker to stop polling, finish/cancel the bounded in-flight database operation within configured timeouts, close the pool and emit `customer_asset_upload_expiry_worker_stopped`.

## Monitoring and alert response

Alert on:
1. No ready heartbeat/start event after deployment or restart.
2. `queueAgeAlert=true` in a completed batch.
3. `alert=true` in a failed batch.
4. Repeated process restarts or failure to emit the stopped event after a planned termination.

For queue-age alerts, verify the worker is assigned to the correct tenant, DB connectivity is healthy, and the dedicated login retains only the intended role membership. Inspect aggregate counts and sanitized audit outcomes; do not query or export customer payloads. If the worker is unavailable, expired sessions may continue to block a new reservation for the same shared asset. Do not bypass the active-session guard manually.

For permission failures, compare applied migrations 027–029 and the login's group membership. Do not grant the worker the generic payment or asset runtime role as a workaround.

## Recovery and rollback

- To pause processing, set `EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED=false` and restart the process. The entrypoint fails closed when disabled.
- To recover, correct the secret/configuration or role membership, verify readiness, and restart through the supervisor.
- Re-running the worker is idempotent: only stale active sessions are transitioned, with one audit event per successful transition.
- Do not delete terminal session history or edit audit events.
- To roll back the application, stop the worker and deploy the prior application version. Do not drop migrations 027–029 or the role while a deployed worker version may still call their functions.
- Any role revocation or migration rollback must be a separately reviewed database change with a backup and recovery plan.

## Acceptance evidence

Before enabling outside a disposable test environment, retain:
- Migration 027–029 application evidence.
- Exact-head fresh-clone and PostgreSQL integration results.
- A role-grant report showing no direct session/asset/scan/payment/provider access and no RLS bypass.
- Startup-disabled, invalid-config, graceful-shutdown and redacted-log test results.
- Supervisor configuration, queue-age/failure alert routing and an operator-approved recovery exercise.
