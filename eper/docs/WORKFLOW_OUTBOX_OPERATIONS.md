# Workflow Outbox Worker Operations

**Status:** implementation contract for the PostgreSQL-backed outbox worker. This document describes the code path and the operational responsibilities that remain with the deployment host.

## Runtime shape

The worker is a continuously running process, not a cron-triggered job. Each pass discovers authorized tenant/application scopes, claims a bounded batch from each scope, and dispatches events. When no work is claimed, it waits for the configured idle poll interval before discovering scopes again.

The host composes the runtime with a restricted platform-worker PostgreSQL pool and an explicit dispatcher. A request-scoped pool must not be supplied. External delivery remains disabled unless the host explicitly supplies an approved dispatcher.

## Delivery and ownership guarantees

- Delivery is **at least once**. A dispatcher must use `eventId` as its idempotency key because a process can stop after a provider accepted an event but before the database acknowledgement is committed.
- Claims are protected by tenant/application scope and a time-limited worker lease.
- Each claimed event starts processing immediately; a serial in-memory queue is avoided so later claims do not age while waiting locally.
- The worker renews each live lease during long dispatches. Renewal never resurrects an expired lease. If renewal fails, the dispatcher receives an aborted signal and the old worker does not acknowledge or mutate the event.
- Expired processing rows that have exhausted the configured attempt budget are moved to dead-letter state by the store's claim-time sweep. Pending rows that exceed a subsequently lowered budget are also dead-lettered. This covers crashes before `markFailed()` can run.
- Retry delay is exponential and capped by the configured maximum. The attempt budget and lease duration are validated at construction.

## Graceful shutdown

The host maps `SIGINT` and `SIGTERM` to an `AbortSignal`. The process passes that signal through context discovery and into each worker pass. Each dispatcher receives its own signal, which is aborted when the host requests shutdown or the worker loses its lease.

A shutdown-interrupted dispatch is **not** marked delivered or failed. The provider may have accepted the request before observing cancellation; the event remains in its processing state and becomes eligible for lease-expiry recovery. This is intentional: marking it failed could race with a provider-side effect, while marking it delivered could hide a lost delivery. Provider idempotency is therefore mandatory.

The host removes its signal listeners after the runtime exits. Deployment supervision (restart policy, termination grace period, and process replacement after an unexpected crash) remains the responsibility of the deployment platform.

## Observability contract

The process exposes per-pass counters through the `onPass` callback:

- `claimed`, `delivered`, `retried`, `deadLettered`
- `leaseLost`, `interrupted`, `contextsVisited`

Errors are surfaced through `onError`. Observability callbacks are isolated so a telemetry failure cannot stop delivery. The deployment host must connect these callbacks to its metrics/logging system and alert on sustained retry growth, lease loss, dead-letter accumulation, interrupted work, and context-discovery failures.

## Production integration still required

Before enabling a production worker, the deployment must provide and verify:

1. A restricted PostgreSQL worker connection pool and tenant/application scope discovery.
2. An approved dispatcher with provider-side idempotency and cancellation handling.
3. Process supervision, termination grace period, restart policy, and safe rolling replacement.
4. Metrics/log export and alerts for the counters and errors above.
5. An operational dead-letter inspection, replay, and audited resolution workflow.
6. Load/concurrency limits appropriate to provider rate limits and database capacity.

No cloud infrastructure is provisioned by this implementation. The runtime code and its automated tests do not by themselves establish that a production host, provider credentials, dashboards, or alerting have been configured.
