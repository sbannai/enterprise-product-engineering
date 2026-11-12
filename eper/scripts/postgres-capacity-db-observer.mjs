#!/usr/bin/env node
/**
 * Local-only, low-cardinality PostgreSQL observer for EPER capacity runs.
 * Samples aggregate server counters only; never reads query text or row data.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pg from "pg";

const fail = (code) => { console.error(code); process.exit(1); };
const connectionString = process.env.EPER_CAPACITY_BENCH_DATABASE_URL?.trim();
if (!connectionString) fail("EPER_CAPACITY_BENCH_DATABASE_URL_REQUIRED");
let url;
try { url = new URL(connectionString); } catch { fail("BENCHMARK_DATABASE_URL_INVALID"); }
if (!["postgres:", "postgresql:"].includes(url.protocol) || url.search || url.hash) fail("BENCHMARK_DATABASE_URL_OPTIONS_UNSUPPORTED");
let databaseName;
try { databaseName = decodeURIComponent(url.pathname.replace(/^\//, "")); } catch { fail("BENCHMARK_DATABASE_NAME_INVALID"); }
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !databaseName.endsWith("_bench")) {
  fail("BENCHMARK_REFUSED: observer requires loopback PostgreSQL and a database name ending in _bench.");
}
const intervalMs = Number(process.env.EPER_CAPACITY_BENCH_SAMPLE_INTERVAL_MS ?? 1000);
const durationSeconds = Number(process.env.EPER_CAPACITY_BENCH_OBSERVE_SECONDS ?? 600);
if (!Number.isInteger(intervalMs) || intervalMs < 250 || intervalMs > 10000 ||
    !Number.isInteger(durationSeconds) || durationSeconds < 5 || durationSeconds > 3600) {
  fail("BENCHMARK_OBSERVER_PARAMETERS_INVALID");
}
const outputPath = resolve(process.env.EPER_CAPACITY_BENCH_DB_OUTPUT ?? "artifacts/postgres-capacity/db-observations.json");
const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000, application_name: "eper-capacity-observer" });
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const samples = [];
try {
  const identity = await pool.query("SELECT current_database() AS database_name, current_setting('server_version') AS server_version");
  if (identity.rows[0]?.database_name !== databaseName) fail("BENCHMARK_DATABASE_IDENTITY_MISMATCH");
  const startedAt = new Date().toISOString();
  const endAt = Date.now() + durationSeconds * 1000;
  while (Date.now() < endAt) {
    const sampledAt = new Date().toISOString();
    const [activity, database] = await Promise.all([
      pool.query(`SELECT count(*) FILTER (WHERE state = 'active')::int AS active,
                         count(*) FILTER (WHERE state = 'idle')::int AS idle,
                         count(*) FILTER (WHERE wait_event_type = 'Lock')::int AS lock_waiters,
                         count(*)::int AS total
                  FROM pg_stat_activity
                  WHERE datname = current_database()`),
      pool.query(`SELECT xact_commit, xact_rollback, blks_hit, blks_read,
                         deadlocks, temp_bytes, numbackends
                  FROM pg_stat_database WHERE datname = current_database()`),
    ]);
    samples.push({ sampledAt, activity: activity.rows[0], database: database.rows[0] });
    await sleep(Math.min(intervalMs, Math.max(0, endAt - Date.now())));
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify({
    schemaVersion: 1, database: databaseName, postgresVersion: identity.rows[0].server_version,
    startedAt, finishedAt: new Date().toISOString(), intervalMs, durationSeconds, samples,
    note: "Aggregate pg_stat_activity and pg_stat_database snapshots only. No query text, bind values, tenant identifiers or row data. Counters are cumulative; compare deltas between samples."
  }, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ database: databaseName, samples: samples.length, outputPath }));
} catch {
  fail("BENCHMARK_OBSERVER_FAILED");
} finally {
  await pool.end();
}
