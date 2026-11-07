# Workflow outbox worker operations

**Status:** independently launchable worker host is implemented, but runtime remains disabled until a separately approved dispatcher, restricted PostgreSQL login and external process supervision are configured. This document is not a production deployment authorization.

## Launch boundary

The worker is a separate long-running process, not an API timer and not request-traffic driven.

```sh
cd eper
npm ci
npm run build
npm run start:workflow-outbox-worker
```

It fails closed unless all of the following are configured:

- `EPER_WORKFLOW_OUTBOX_WORKER_ENABLED=true`
- `EPER_AUDIT_PERSISTENCE=postgres`
- `EPER_WORKFLOW_OUTBOX_DATABASE_URL` — dedicated PostgreSQL login, separate from API `DATABASE_URL`
- `EPER_WORKFLOW_OUTBOX_EXPECTED_DATABASE_ROLE` — must match PostgreSQL `current_user`
- `EPER_WORKFLOW_OUTBOX_WORKER_ID`
- `EPER_WORKFLOW_OUTBOX_DISPATCHER_MODULE` — compiled JavaScript module under `./dist/apps/worker/dispatchers/`

The entrypoint validates the database role before importing the dispatcher. It resolves both the dispatcher root and target with filesystem realpath checks; symlinks that resolve outside the deployment dispatcher directory are rejected. The module must export `createWorkflowOutboxDispatcher({ pool, env })`. There is no default or no-op dispatcher.

The returned dispatcher must implement:

- `authorizeDispatch(event, signal)`: consult durable approval for this exact event and return true only when approval is valid and current.
- `dispatch(event, signal)`: perform the approved delivery and deduplicate using `event.eventId`.

Authorization is checked immediately before dispatch. A denied event is parked in dead-letter for review, not retried as a transient provider failure. Transient failures use bounded retry/backoff. The store's monotonic `claim_generation` is returned with every claim and required for lease renewal, acknowledgement and failure mutation; a stale process cannot mutate a later takeover, even if it reuses the same worker ID.

## Restricted PostgreSQL login

Migration `015_workflow_outbox_worker_access.sql` creates the NOLOGIN least-privilege group. Migration `016_workflow_outbox_claim_generation.sql` grants UPDATE on the fencing token column only. A DBA provisions a separate LOGIN role and injects its credential through the approved secret channel:

```sql
CREATE ROLE eper_workflow_outbox_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE eper TO eper_workflow_outbox_worker;
GRANT eper_workflow_outbox_worker_access TO eper_workflow_outbox_worker;
```

Do not grant ownership, superuser, BYPASSRLS, assignment writes, event writes, delivery INSERT/DELETE/TRUNCATE, or broad delivery UPDATE. The startup gate verifies the actual login identity, role attributes, FORCE RLS, ownership/membership, column-only assignment discovery, read-only event access, and the precise allowed delivery-state UPDATE columns (including `claim_generation`). It refuses to start if any privilege is missing or broader than the contract.

The worker uses the restricted pool for context discovery and all outbox operations. Context discovery reads only active tenant/application assignment columns. Every claim, lease renewal, acknowledgement and failure mutation sets tenant/application RLS context. Keep the worker login out of API credentials and human/admin roles.

## Runtime controls

Optional bounded settings:

- `EPER_WORKFLOW_OUTBOX_BATCH_SIZE` (1–100; default 20)
- `EPER_WORKFLOW_OUTBOX_IDLE_POLL_MS` (50–60,000; default 1,000)
- `EPER_WORKFLOW_OUTBOX_MAX_CONTEXTS` (1–10,000; default 1,000)
- `EPER_WORKFLOW_OUTBOX_MAX_ATTEMPTS` (1–100; default 8)
- `EPER_WORKFLOW_OUTBOX_LEASE_SECONDS` (10–3,600; default 60)
- `EPER_WORKFLOW_OUTBOX_BASE_RETRY_DELAY_SECONDS` (0–86,400; default 5)
- `EPER_WORKFLOW_OUTBOX_MAX_RETRY_DELAY_SECONDS` (at least base delay, at most 86,400; default 3,600)

SIGINT/SIGTERM are converted to an AbortSignal. Shutdown stops lease heartbeats, leaves ambiguous in-flight outcomes for lease-expiry recovery, removes signal handlers and closes the PostgreSQL pool. The process emits structured pass counters for claimed, delivered, retried, dead-lettered, lease-lost and interrupted work. Run under an external process supervisor with restart backoff and alerting on process exit, pass errors, backlog age/depth and dead-letter growth.

## Deployment and safety limitations

- No concrete provider dispatcher, secret resolver, credential provider or external integration SDK is bundled.
- No dispatcher is enabled by default; no provider action is triggered by this code change.
- A green CI run does not prove a deployment has a dedicated login, approved dispatcher, external process supervisor or production metrics sink.
- At-least-once delivery requires dispatcher idempotency keyed by event ID.
- Claim-generation fencing prevents stale DB acknowledgements; it does not make external side effects exactly-once. Provider idempotency remains mandatory.
- The host foundation is not a production release or business acceptance declaration. Business UAT remains unauthorized until all entry gates are evidenced.
