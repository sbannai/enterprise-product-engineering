# Workflow Outbox Worker Operations

**Status:** implementation contract for the PostgreSQL-backed outbox worker. Runtime code and tests do not by themselves establish that a production host, provider credentials, dashboards, or alerting have been configured.

## Runtime shape

The worker is a continuously running process, not a cron-triggered job. Each pass discovers authorized tenant/application scopes, claims a bounded batch from each scope, and dispatches events. When no work is claimed, it waits for the configured idle poll interval before discovering scopes again.

The host composes the runtime with a restricted platform-worker PostgreSQL pool and an explicit dispatcher. External delivery remains disabled unless the host explicitly supplies an approved dispatcher.

## Delivery and ownership guarantees

- Delivery is **at least once**. A dispatcher must use the immutable `eventId` as its idempotency key.
- Claims are protected by tenant/application scope and a time-limited worker lease.
- Each claimed event starts processing immediately; a serial in-memory queue is avoided.
- The worker renews each live lease during long dispatches. Renewal never resurrects an expired lease. If renewal fails, the dispatcher receives an aborted signal and the old worker does not acknowledge or mutate the event.
- Expired processing rows that exceed the configured attempt budget are moved to dead-letter state by the store's claim-time sweep.
- Retry delay is exponential and capped by the configured maximum.

## Graceful shutdown

The host maps `SIGINT` and `SIGTERM` to an `AbortSignal`. The process passes that signal through context discovery and into each worker pass. Each dispatcher receives its own signal, which is aborted when the host requests shutdown or the worker loses its lease.

A shutdown-interrupted dispatch is not marked delivered or failed. The provider may have accepted the request before observing cancellation; the event remains in its processing state and becomes eligible for lease-expiry recovery. The heartbeat stops immediately on shutdown, including when a dispatcher does not cooperate with cancellation.

## Observability contract

Per-pass counters include `claimed`, `delivered`, `retried`, `deadLettered`, `leaseLost`, `interrupted`, and `contextsVisited`. Errors are surfaced through `onError`. The deployment host must connect these callbacks to its metrics/logging system and alert on sustained retry growth, lease loss, dead-letter accumulation, interrupted work, and context-discovery failures.

## Audited dead-letter replay

The administrative replay service is a separate, explicit operator action; the worker never replays dead letters automatically.

- The caller must be an active actor in an active tenant/application assignment and hold `workflow:admin`.
- A non-empty operator reason and an idempotency key are mandatory.
- Replay is accepted only while the delivery projection is `dead_letter`; a compare-and-set state transition moves it to `pending`.
- The immutable original event ID and payload are retained. Attempt count and last error are not reset; the replay ledger captures their pre-replay values.
- Replay ledger insertion, the global append-only audit-chain event, and the delivery-state transition commit in one database transaction.
- The replay ledger is tenant/application RLS-protected and rejects update, delete, and truncate.
- Repeating the same idempotency key for the same event returns the original replay result. Reusing the key for a different event is rejected.
- Replay does not invoke a provider. Subsequent delivery remains at-least-once and the dispatcher must deduplicate using the original event ID.

## Production integration still required

Before enabling a production worker, the deployment must provide and verify:
1. A restricted PostgreSQL worker connection pool and tenant/application scope discovery.
2. An approved dispatcher with provider-side idempotency and cancellation handling.
3. Process supervision, termination grace period, restart policy, and safe rolling replacement.
4. Metrics/log export and alerts for the counters and errors above.
5. An authorized operator interface for dead-letter inspection and audited replay.
6. Load/concurrency limits appropriate to provider rate limits and database capacity.

No cloud infrastructure is provisioned by this implementation.
