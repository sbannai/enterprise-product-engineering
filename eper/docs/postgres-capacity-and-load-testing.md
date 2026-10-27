# EPER PostgreSQL capacity and load-testing plan

## Decision
PostgreSQL is the transactional system of record for EPER. Do not introduce sharding or a second transactional database before measured evidence requires it. First establish a representative baseline and protect the database from connection storms, long-running transactions, unbounded concurrency, and inefficient tenant-scoped queries.

## Runtime safeguards
The API's shared PostgreSQL pool is bounded per process and has deployment-configurable limits:
- `EPER_PG_POOL_MAX`: default 10, allowed 1–50.
- `EPER_PG_CONNECTION_TIMEOUT_MS`: default 5,000 ms, allowed 500–30,000.
- `EPER_PG_IDLE_TIMEOUT_MS`: default 30,000 ms, allowed 1,000–300,000.
- `EPER_PG_STATEMENT_TIMEOUT_MS`: default 15,000 ms, allowed 500–120,000.
- `EPER_PG_QUERY_TIMEOUT_MS`: default 20,000 ms, allowed 500–120,000.
- `EPER_PG_LOCK_TIMEOUT_MS`: default 5,000 ms, allowed 100–60,000.
- `EPER_PG_IDLE_IN_TRANSACTION_TIMEOUT_MS`: default 10,000 ms, allowed 500–120,000.

Values are validated at startup; invalid values fail startup rather than silently selecting an unsafe configuration. Statement/query/lock timeouts must be reviewed against actual transaction duration and the global audit-chain advisory lock. A timeout should surface as a controlled failure, never as permission to skip audit or tenant policy.

## Connection budget
The pool limit is per API process, not a deployment-wide limit. Before scaling replicas, calculate:

`(API replicas × EPER_PG_POOL_MAX) + worker pools + migration/admin reserve <= usable PostgreSQL connections`

Keep headroom for failover, maintenance, monitoring, and interactive administration. If connection demand grows beyond the safe database budget, use a managed pooler such as PgBouncer where deployment-compatible, rather than simply raising the per-process pool size. Do not enable additional replicas until this budget is checked.

## Load test matrix
Run against a dedicated UAT/staging PostgreSQL instance with production-like schema, indexes, data volume, and audit enabled. Never run destructive load tests against production.

1. **Baseline:** 1× expected peak API request rate for 30 minutes; mix read/list, draft creation/review, configuration reads, and payment-status reads.
2. **Ramp:** 2× and 3× expected peak for 15 minutes each; increase concurrency gradually and record the saturation point.
3. **Burst:** 5× baseline for 60 seconds; verify bounded queueing, predictable rejection/timeouts, and recovery without a manual restart.
4. **Soak:** 1× expected peak for 4 hours; inspect pool leaks, memory growth, locks, table/index growth, and latency drift.
5. **Tenant skew:** include one large tenant plus many small tenants; verify one tenant cannot exhaust the service or read another tenant's data.
6. **Audit contention:** run concurrent audited mutations and verify hash-chain integrity, no forks, and no business mutation committed without its required audit event.
7. **Failure injection:** pause/restart the database, force connection exhaustion, delay queries, and simulate worker retries. Verify fail-closed behavior and recovery.
8. **Worker separation:** run AI/provider latency and campaign jobs asynchronously; database transactions must not remain open while waiting on external services.

## Proposed acceptance gates
These are targets to validate, not measured results:
- Ordinary tenant-scoped API reads/writes: p95 under 300 ms and p99 under 1 second at agreed peak load, excluding external provider calls.
- No cross-tenant/application access in isolation tests.
- No lost or duplicate payment/receipt outcomes under retry and concurrency tests.
- No audit-chain forks or unexplained verification failures.
- Pool saturation produces bounded wait/timeout responses and recovers after load subsides.
- No steadily increasing idle-in-transaction sessions, connection count, or memory during soak.
- Record throughput, p50/p95/p99, error rates, pool wait time, active/idle connections, slow queries, lock waits, CPU, memory, I/O, and database storage growth.

## Scaling order
1. Measure the current baseline; inspect query plans and add indexes supported by evidence.
2. Tune pool size and timeouts within the total connection budget.
3. Move slow work to durable asynchronous workers; keep transactions short.
4. Add read replicas only for appropriate read workloads with acceptable staleness.
5. Partition high-volume append-only audit/event data only when measured maintenance/query costs justify it; retain the integrity-verification and retention controls.
6. Consider sharding only after a documented capacity test proves a single primary plus normal scaling measures cannot meet requirements.

## Current limitation
CI passing is not a database capacity result. EPER has not yet produced a measured throughput ceiling or a production capacity guarantee from the code changes alone. Final pool values and hardware sizing must be based on expected peak traffic, data size, managed PostgreSQL limits, and the above load-test results.
