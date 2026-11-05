# EPER PostgreSQL Capacity Validation Plan

**Status:** Draft engineering validation plan; no capacity claim or production approval.
**Baseline inspected:** integration/asset-provider-stack-validation at 73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e.
**Scope:** Local/disposable PostgreSQL 16 only. No chargeable cloud resources, production credentials, or production data.

## 1. Current implementation facts

The API runtime creates a pg.Pool through createPostgresPaymentPool():

- EPER_PG_POOL_MAX: default 10, allowed 1–50, per process.
- EPER_PG_CONNECTION_TIMEOUT_MS: default 5,000 ms.
- EPER_PG_IDLE_TIMEOUT_MS: default 30,000 ms.
- EPER_PG_STATEMENT_TIMEOUT_MS: default 15,000 ms.
- EPER_PG_QUERY_TIMEOUT_MS: default 20,000 ms.
- EPER_PG_LOCK_TIMEOUT_MS: default 5,000 ms.
- EPER_PG_IDLE_IN_TRANSACTION_TIMEOUT_MS: default 10,000 ms.

The payment/capability pool is reused by multiple stores in the API process. The platform-admin and provider-catalogue control-plane paths can create additional independent pools. Worker processes may create their own pools. Therefore the database connection budget is not simply the API pool maximum.

**Connection budget formula**

total_peak_connections = (api_replicas × api_pool_max) + Σ(worker_replicas × worker_pool_max) + privileged_pools + migration/admin reserve

Do not increase EPER_PG_POOL_MAX without checking the PostgreSQL server's usable connection limit, other clients, and the resulting per-process multiplication. Keep a reserve for operators, migrations, monitoring and failover.

## 2. What existing evidence does and does not prove

Existing fresh-clone, PostgreSQL integration, migration-repeatability and backup/restore checks demonstrate correctness for their tested scenarios. They do not establish requests/second, concurrent-user capacity, p95/p99 latency, saturation point, or sustained-load stability.

The current code includes useful safeguards (bounded pool size, connection/query/statement/lock timeouts and idle-in-transaction timeout). These are resilience controls, not performance measurements.

## 3. Workload model to benchmark

Use representative, tenant-scoped EPER journeys rather than only SELECT 1:

| Workload | Representative operations | Key pressure |
|---|---|---|
| Customer workspace | authenticated session, application assignment, asset metadata list/detail | indexed tenant/application reads |
| Workflow | load published definition, validate actor assignment, create execution/transition, append audit/outbox | short write transactions, row contention |
| Payment | tenant/order lookup, idempotent order reservation, webhook event deduplication, receipt lookup | unique indexes, concurrent duplicate callbacks |
| Customer assets | reserve upload session, idempotency lookup, completion/verification state update, download authorization | advisory locks, metadata writes, tenant isolation |
| Background workers | claim/lease, heartbeat, complete/retry, dead-letter | SKIP LOCKED, lease contention, write amplification |
| Audit | append event and update chain head in the same transaction | serialized hot rows, WAL and index growth |

Large binary objects must remain in object storage; PostgreSQL should hold metadata, lifecycle state, references and audit evidence—not video/document payloads except explicitly approved small artifacts such as receipt PDFs.

## 4. Test environment and safety

1. Use a disposable local PostgreSQL 16 instance and a dedicated database created only for this benchmark.
2. Use synthetic tenants, applications, actors and payment/asset/workflow records. No production or customer data.
3. Run migrations using the repository's documented local developer verification flow; capture migration version and database configuration.
4. Record CPU, RAM, storage type/IOPS, PostgreSQL version/settings, pool sizes, replica counts, worker counts and client generator location.
5. Start with read-only smoke tests. Enable write/concurrency tests only against the disposable database.
6. Never run stress tests against a shared development, staging or production database.
7. Capture query plans with EXPLAIN (ANALYZE, BUFFERS) using representative synthetic cardinalities. Do not run EXPLAIN ANALYZE on destructive statements in a shared environment.

## 5. Load progression

These are proposed test points, not supported-capacity claims. Hold each stage only after the previous stage is stable.

| Stage | Concurrent virtual users | Duration | Purpose |
|---|---:|---:|---|
| Smoke | 5 | 5 min | Validate instrumentation and correctness |
| Baseline | 25 | 10 min | Establish latency/throughput baseline |
| Moderate | 100 | 15 min | Observe pool wait and query contention |
| Heavy | 250 | 20 min | Identify first resource bottleneck |
| Stress | 500 | 15 min | Find saturation and controlled failure behaviour |
| Endurance | 100 | 60 min | Detect leaks, bloat and latency drift |
| Recovery | baseline load + DB restart | 10 min | Verify bounded errors and recovery after reconnect |

Use a ramp-up rather than an instantaneous jump. Record both successful business transactions/sec and HTTP requests/sec; they are not interchangeable. Repeat each stage at least three times after warm-up.

## 6. Required measurements

### Application and pool
- Request rate, successful business transactions/sec and error rate.
- p50, p95 and p99 latency by route and transaction type.
- Pool total/idle/waiting counts, acquisition wait time and connection timeouts.
- Event-loop delay, process CPU and memory.
- Worker claim rate, lease expirations, retries and dead-letter counts.

### PostgreSQL
- Active/idle connections and connection saturation.
- CPU, memory, disk throughput/latency, WAL generation and checkpoints.
- pg_stat_statements: calls, mean/max execution time, rows and shared block reads/hits.
- Lock waits, deadlocks, long transactions and idle-in-transaction sessions.
- Table/index size, sequential vs index scans, autovacuum activity and replication lag if applicable.

### Correctness under load
- No cross-tenant/application reads or writes.
- No duplicate payment capture/receipt or duplicate workflow transition under retries.
- Idempotency remains deterministic under concurrent requests.
- Audit and business state remain atomic where required.
- No lost/duplicated worker operation after restart or lease expiry.
- No unbounded queue/pool growth, leaked clients or unrecovered worker failures.

## 7. Provisional pass/fail gates

These are proposed engineering gates for review, not yet owner-approved SLAs:

- At the agreed target load: p95 API latency ≤ 500 ms for ordinary database-backed reads and ≤ 1,000 ms for ordinary writes, excluding external provider latency.
- p99 remains below 2 seconds for the same bounded database operations.
- Error rate below 0.5% at target load, excluding intentionally injected failures.
- No deadlocks, cross-tenant access, duplicate business effects or lost durable operations.
- Pool waiters return to zero after load drops; no sustained connection exhaustion.
- CPU and storage retain operational headroom; do not accept a test that runs continuously at saturation.
- Recovery after database restart is measured and documented; no claim of zero downtime unless proven.

The owner must confirm target user population, peak-hour traffic, acceptable latency and availability before these thresholds become acceptance criteria.

## 8. Capacity decision

Report the highest repeatably sustained workload that passes all correctness and latency gates, not the highest short-lived request burst. Publish:
- exact source SHA and test-script SHA;
- environment and connection budget;
- workload mix, ramp profile and repetitions;
- raw run artifacts and dashboard snapshots;
- p50/p95/p99, throughput, errors and resource utilization;
- first saturation bottleneck and remediation;
- tested ceiling, recommended operating ceiling (with headroom), and untested assumptions.

Until this evidence exists, PostgreSQL capacity is NOT MEASURED. The database remains the current implementation target; MySQL and MongoDB remain architectural alternatives if measured results or operational requirements justify a change.

## 9. Next implementation steps

1. Add a reproducible disposable-PostgreSQL workload harness that exercises the actual EPER API and worker paths.
2. Add low-cardinality pool and query telemetry without logging SQL parameters, credentials, tenant secrets or personal data.
3. Run the staged workload locally and retain raw machine-readable results.
4. Tune indexes, pool sizing or query patterns only from measured bottlenecks; rerun correctness and exact-head CI after changes.


## 10. Initial local API probe (implemented; execution pending)

A guarded, read-only API probe is available at `scripts/postgres-capacity-api-bench.mjs` and through `npm run bench:postgres-api`.

Required environment:
- `EPER_CAPACITY_BENCH_DATABASE_URL`: disposable PostgreSQL URL; host must be loopback and database name must end in `_bench`.
- `EPER_CAPACITY_BENCH_API_URL`: local EPER API origin (loopback only).
- `EPER_CAPACITY_BENCH_PATH`: an absolute same-origin route path to exercise. Protocol-relative paths, backslashes and control characters are refused; `/health` and `/` are refused because they do not prove database-backed work.
- Optional `EPER_CAPACITY_BENCH_BEARER_TOKEN` or `EPER_CAPACITY_BENCH_COOKIE`: local test identity only; values are never printed or written to the result.
- Optional `EPER_CAPACITY_BENCH_CONCURRENCY` (1–100), `EPER_CAPACITY_BENCH_DURATION_SECONDS` (5–3600), `EPER_CAPACITY_BENCH_WARMUP_SECONDS`, `EPER_CAPACITY_BENCH_RAMP_SECONDS`, `EPER_CAPACITY_BENCH_REQUEST_TIMEOUT_MS`, and `EPER_CAPACITY_BENCH_OUTPUT`.

Example (replace the route with an existing read-only API route whose test identity is authorized):
```sh
EPER_CAPACITY_BENCH_DATABASE_URL='postgres://eper:local-only@127.0.0.1:5432/eper_bench' \
EPER_CAPACITY_BENCH_API_URL='http://127.0.0.1:8080' \
EPER_CAPACITY_BENCH_PATH='/customer/applications' \
EPER_CAPACITY_BENCH_CONCURRENCY=25 \
EPER_CAPACITY_BENCH_DURATION_SECONDS=600 \
EPER_CAPACITY_BENCH_WARMUP_SECONDS=30 \
EPER_CAPACITY_BENCH_RAMP_SECONDS=30 \
npm run bench:postgres-api
```

The runner accepts only a PostgreSQL URL with a loopback hostname, an `_bench` database name and no query/fragment overrides (including driver-level host overrides); it accepts only a loopback API origin without embedded credentials. It verifies connectivity and database identity against the disposable benchmark database, uses closed-loop concurrent HTTP requests, consumes response bodies, and writes a mode-0600 JSON result with request rate, status counts, error categories and p50/p95/p99 latency. Fail-closed guard tests cover remote hosts, database query overrides, URL credentials, path forms, health-only routes and write methods. It supports GET/HEAD only; state-changing scenarios require a separately reviewed synthetic-data setup and idempotency/correctness assertions. Do not place credentials in command-line arguments or URLs that may be captured by shell history; use environment injection from a local secret-safe shell.

**Important limitation:** the runner cannot independently prove that the running API process uses the same database URL. The operator must start the API with the same disposable database configuration and verify its effective persistence mode before running. The result is an API-route probe, not a PostgreSQL-only benchmark or capacity certification. Correlate it with PostgreSQL server and pool metrics. The current environment has not executed this runner; no performance results are claimed.


### Aggregate PostgreSQL observer

A companion observer is available as `scripts/postgres-capacity-db-observer.mjs` via `npm run observe:postgres-capacity`. Run it in a second terminal alongside the API probe, against the same disposable local database. It samples aggregate `pg_stat_activity` counts (active, idle, lock waiters, total) and `pg_stat_database` counters (commits, rollbacks, buffer hits/reads, deadlocks, temporary bytes, backends). It writes mode-0600 JSON and never reads query text, bind values, tenant identifiers or row data.

Configure `EPER_CAPACITY_BENCH_OBSERVE_SECONDS` (5–3600; default 600), `EPER_CAPACITY_BENCH_SAMPLE_INTERVAL_MS` (250–10000; default 1000) and `EPER_CAPACITY_BENCH_DB_OUTPUT` (default `artifacts/postgres-capacity/db-observations.json`). It applies the same loopback + `_bench` database guard and rejects connection-string query/fragment overrides.

The observer's counters are cumulative; compare adjacent samples to derive deltas. It does **not** currently expose application pool waiters, query-level latency, CPU, memory or disk I/O. Those require separate application instrumentation and host-level monitoring; do not infer them from these snapshots.
