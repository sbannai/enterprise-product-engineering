#!/usr/bin/env node
/**
 * Local-only EPER API capacity probe.
 * Exercises one explicitly selected API route with closed-loop concurrency.
 * It deliberately does not generate SQL or claim database capacity on its own.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import pg from "pg";

const fail = (code) => { console.error(code); process.exit(1); };
const databaseUrl = process.env.EPER_CAPACITY_BENCH_DATABASE_URL?.trim();
const targetText = process.env.EPER_CAPACITY_BENCH_API_URL?.trim();
const path = process.env.EPER_CAPACITY_BENCH_PATH?.trim();
if (!databaseUrl || !targetText || !path) {
  fail("EPER_CAPACITY_BENCH_DATABASE_URL, EPER_CAPACITY_BENCH_API_URL and EPER_CAPACITY_BENCH_PATH are required.");
}
let db, target;
try { db = new URL(databaseUrl); target = new URL(path, targetText); } catch { fail("EPER_CAPACITY_BENCH_URL_INVALID"); }
const loopback = (host) => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
const dbName = decodeURIComponent(db.pathname.replace(/^\//, ""));
if (!loopback(db.hostname) || !dbName.endsWith("_bench")) fail("BENCHMARK_REFUSED: database must be loopback and its name must end in _bench.");
if (!loopback(target.hostname) || !["http:", "https:"].includes(target.protocol)) fail("BENCHMARK_REFUSED: API target must be loopback.");
if (target.pathname === "/health" || target.pathname === "/") fail("BENCHMARK_REFUSED: select a real API route, not a health-only endpoint.");
if (!["GET", "HEAD"].includes((process.env.EPER_CAPACITY_BENCH_METHOD ?? "GET").toUpperCase())) fail("Only GET and HEAD are currently supported; write workloads require a separately reviewed scenario.");
const concurrency = Number(process.env.EPER_CAPACITY_BENCH_CONCURRENCY ?? 5);
const durationSeconds = Number(process.env.EPER_CAPACITY_BENCH_DURATION_SECONDS ?? 60);
const warmupSeconds = Number(process.env.EPER_CAPACITY_BENCH_WARMUP_SECONDS ?? 10);
const rampSeconds = Number(process.env.EPER_CAPACITY_BENCH_RAMP_SECONDS ?? 10);
if (![concurrency, durationSeconds, warmupSeconds, rampSeconds].every(Number.isFinite) ||
    !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100 ||
    durationSeconds < 5 || durationSeconds > 3600 || warmupSeconds < 0 || warmupSeconds > 300 ||
    rampSeconds < 0 || rampSeconds > 300) fail("BENCHMARK_PARAMETERS_INVALID (concurrency 1-100; duration 5-3600s; warmup/ramp 0-300s).");

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000 });
let databaseIdentity;
try {
  const result = await pool.query("SELECT current_database() AS database_name, current_setting('server_version') AS server_version");
  databaseIdentity = result.rows[0];
  if (databaseIdentity.database_name !== dbName) fail("BENCHMARK_DATABASE_IDENTITY_MISMATCH");
} catch (error) {
  await pool.end();
  fail(error instanceof Error ? "BENCHMARK_DATABASE_CONNECTION_FAILED" : "BENCHMARK_DATABASE_CONNECTION_FAILED");
} finally {
  await pool.end();
}

const method = (process.env.EPER_CAPACITY_BENCH_METHOD ?? "GET").toUpperCase();
const headers = { accept: "application/vnd.eper.v1+json, application/json" };
const token = process.env.EPER_CAPACITY_BENCH_BEARER_TOKEN;
if (token) headers.authorization = `Bearer ${token}`;
const cookie = process.env.EPER_CAPACITY_BENCH_COOKIE;
if (cookie) headers.cookie = cookie;
const requestTimeoutMs = Number(process.env.EPER_CAPACITY_BENCH_REQUEST_TIMEOUT_MS ?? 10000);
if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 100 || requestTimeoutMs > 120000) fail("BENCHMARK_REQUEST_TIMEOUT_INVALID");

const samples = [];
let completed = 0, failed = 0, inFlight = 0, stopAt = 0;
const errors = new Map();
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const percentile = (values, p) => values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] : null;
const sorted = (values) => [...values].sort((a, b) => a - b);

async function requestOnce(record) {
  const started = performance.now();
  inFlight++;
  try {
    const response = await fetch(target, { method, headers, signal: AbortSignal.timeout(requestTimeoutMs), redirect: "manual" });
    const elapsed = performance.now() - started;
    // Consume the body to measure full response completion and avoid socket buildup.
    await response.arrayBuffer();
    if (record) {
      samples.push(elapsed);
      if (response.status >= 200 && response.status < 400) completed++;
      else {
        failed++;
        const key = `http_${response.status}`;
        errors.set(key, (errors.get(key) ?? 0) + 1);
      }
    }
  } catch (error) {
    if (record) {
      failed++;
      const key = error?.name === "TimeoutError" ? "timeout" : "network_error";
      errors.set(key, (errors.get(key) ?? 0) + 1);
    }
  } finally { inFlight--; }
}

console.log("EPER_CAPACITY_BENCH_START");
console.log(JSON.stringify({ apiOrigin: target.origin, route: target.pathname, method, database: dbName, postgresVersion: databaseIdentity.server_version, concurrency, durationSeconds, warmupSeconds, rampSeconds, requestTimeoutMs }));
for (let i = 0; i < Math.min(concurrency, 5); i++) await requestOnce(false);
const warmupEnd = performance.now() + warmupSeconds * 1000;
while (performance.now() < warmupEnd) await requestOnce(false);
const startedAt = new Date().toISOString();
const start = performance.now();
stopAt = start + durationSeconds * 1000;
const workers = Array.from({ length: concurrency }, async (_, index) => {
  if (rampSeconds > 0) await sleep((rampSeconds * 1000 * index) / concurrency);
  while (performance.now() < stopAt) await requestOnce(true);
});
await Promise.all(workers);
const elapsedSeconds = (performance.now() - start) / 1000;
const latencies = sorted(samples);
const result = {
  schemaVersion: 1,
  startedAt,
  finishedAt: new Date().toISOString(),
  apiOrigin: target.origin,
  route: target.pathname,
  method,
  database: dbName,
  postgresVersion: databaseIdentity.server_version,
  concurrency,
  durationSeconds,
  warmupSeconds,
  rampSeconds,
  requestTimeoutMs,
  requests: samples.length,
  successful: completed,
  failed,
  requestsPerSecond: Number((samples.length / elapsedSeconds).toFixed(2)),
  latencyMs: {
    min: latencies.length ? Number(latencies[0].toFixed(2)) : null,
    mean: latencies.length ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)) : null,
    p50: percentile(latencies, 0.50) === null ? null : Number(percentile(latencies, 0.50).toFixed(2)),
    p95: percentile(latencies, 0.95) === null ? null : Number(percentile(latencies, 0.95).toFixed(2)),
    p99: percentile(latencies, 0.99) === null ? null : Number(percentile(latencies, 0.99).toFixed(2)),
    max: latencies.length ? Number(latencies.at(-1).toFixed(2)) : null
  },
  errorCategories: Object.fromEntries(errors),
  note: "API route probe only. Correlate with PostgreSQL and pool telemetry; this is not a standalone database or production-capacity certification."
};
const outputPath = resolve(process.env.EPER_CAPACITY_BENCH_OUTPUT ?? "artifacts/postgres-capacity/api-load-result.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(result, null, 2));
console.log(`RESULT_WRITTEN=${outputPath}`);
