# Workflow outbox worker operations

**Status:** independently launchable worker foundation; deployment remains disabled until an owner-approved dispatcher and restricted PostgreSQL login are supplied.

## Launch boundary

The worker is a separate process, not an API timer and not request-traffic driven.

```sh
cd eper
npm run build
npm run start:workflow-outbox-worker
```

The command fails closed unless all of the following are configured:

- `EPER_WORKFLOW_OUTBOX_WORKER_ENABLED=true`
- `EPER_AUDIT_PERSISTENCE=postgres`
- `EPER_WORKFLOW_OUTBOX_DATABASE_URL` — a dedicated PostgreSQL login, not the API's `DATABASE_URL`
- `EPER_WORKFLOW_OUTBOX_EXPECTED_DATABASE_ROLE` — must match PostgreSQL `current_user`
- `EPER_WORKFLOW_OUTBOX_WORKER_ID`
- `EPER_WORKFLOW_OUTBOX_DISPATCHER_MODULE` — a compiled JavaScript module below `./dist/apps/worker/dispatchers/`

No default/no-op dispatcher exists. The dispatcher module must export `createWorkflowOutboxDispatcher({ pool, env })` and return both:

- `authorizeDispatch(event, signal)`: consult durable approval for this exact event and return true only when approval is valid and current.
- `dispatch(event, signal)`: perform the approved delivery and deduplicate using `event.eventId`.

The worker calls authorization immediately before dispatch. A denied event is dead-lettered immediately for operator review; it is not retried as a transient provider failure. Transient dispatch errors retain bounded retry/backoff behavior.

## Restricted PostgreSQL login

A DBA should provision the worker login separately from application migrations and inject its credential through the approved secret channel. The intended privilege shape is:

```sql
CREATE ROLE eper_workflow_outbox_worker LOGIN NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE eper TO eper_workflow_outbox_worker;
GRANT USAGE ON SCHEMA public TO eper_workflow_outbox_worker;
GRANT SELECT ON eper_tenant_application_assignment TO eper_workflow_outbox_worker;
GRANT SELECT ON eper_workflow_outbox_events TO eper_workflow_outbox_worker;
GRANT SELECT, UPDATE ON eper_workflow_outbox_delivery TO eper_workflow_outbox_worker;
```

Do not grant ownership, superuser, BYPASSRLS, INSERT, DELETE or TRUNCATE privileges. The worker's startup gate checks the actual login identity, role elevation, outbox-table RLS, table ownership, required SELECT/UPDATE privileges and absence of broader write grants. It refuses to start when those checks fail.

The outbox store sets tenant/application RLS context for every claim, lease renewal, acknowledgement and failure update. Context discovery reads only active tenant/application assignments. Keep the worker login out of API credentials and all human/admin roles.

## Runtime controls

Optional bounded settings:

- `EPER_WORKFLOW_OUTBOX_BATCH_SIZE` (1–100; default 20)
- `EPER_WORKFLOW_OUTBOX_IDLE_POLL_MS` (50–60,000; default 1,000)
- `EPER_WORKFLOW_OUTBOX_MAX_CONTEXTS` (1–10,000; default 1,000)
- `EPER_WORKFLOW_OUTBOX_MAX_ATTEMPTS` (1–100; default 8)
- `EPER_WORKFLOW_OUTBOX_LEASE_SECONDS` (10–3,600; default 60)
- `EPER_WORKFLOW_OUTBOX_BASE_RETRY_DELAY_SECONDS` (0–86,400; default 5)
- `EPER_WORKFLOW_OUTBOX_MAX_RETRY_DELAY_SECONDS` (at least base delay, at most 86,400; default 3,600)

The process handles SIGINT/SIGTERM with an AbortSignal, stops extending leases during shutdown, and closes its PostgreSQL pool. It emits structured pass counters for claimed, delivered, retried, dead-lettered, lease-lost and interrupted work. Run it under an external process supervisor with restart backoff and alerting on process exit, pass errors, backlog age/depth and dead-letter growth.

## Security and delivery limitations

- This change does not provide a concrete provider dispatcher, credential resolver or external integration SDK.
- No dispatcher is bundled or enabled by default; this run does not trigger external actions.
- A successful unit/CI run does not prove a deployment has the required restricted database login, approved dispatcher, process supervisor or production metrics sink.
- At-least-once delivery requires dispatcher idempotency keyed by event ID.
- The worker foundation is not a production release or business acceptance declaration.
