import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const eperRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = resolve(eperRoot, "scripts/postgres-capacity-api-bench.mjs");
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("EPER_CAPACITY_BENCH_")),
);

function runBench(overrides = {}) {
  const env = {
    ...cleanEnv,
    EPER_CAPACITY_BENCH_DATABASE_URL: "postgres://bench:secret-not-to-print@127.0.0.1:5432/eper_bench",
    EPER_CAPACITY_BENCH_API_URL: "http://127.0.0.1:8080",
    EPER_CAPACITY_BENCH_PATH: "/customer/applications",
    ...overrides,
  };
  return spawnSync(process.execPath, [scriptPath], {
    cwd: eperRoot, env, encoding: "utf8", timeout: 5_000,
  });
}

function assertRefused(result, code) {
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 1);
  assert.match(result.stderr, code instanceof RegExp ? code : new RegExp(code));
  assert.doesNotMatch(result.stdout + result.stderr, /secret-not-to-print|198\.51\.100\.9|203\.0\.113\.8/);
}

test("capacity probe requires explicit database, API origin and route before any connection", () => {
  assertRefused(runBench({
    EPER_CAPACITY_BENCH_DATABASE_URL: "",
    EPER_CAPACITY_BENCH_API_URL: "",
    EPER_CAPACITY_BENCH_PATH: "",
  }), /EPER_CAPACITY_BENCH_DATABASE_URL/);
});

test("capacity probe refuses database query overrides that could replace the loopback host", () => {
  assertRefused(runBench({
    EPER_CAPACITY_BENCH_DATABASE_URL: "postgres://bench:secret-not-to-print@127.0.0.1:5432/eper_bench?host=198.51.100.9",
  }), "BENCHMARK_DATABASE_QUERY_OPTIONS_UNSUPPORTED");
});

test("capacity probe refuses a non-loopback PostgreSQL host", () => {
  assertRefused(runBench({
    EPER_CAPACITY_BENCH_DATABASE_URL: "postgres://bench:secret-not-to-print@db.example.test:5432/eper_bench",
  }), "BENCHMARK_REFUSED");
});

test("capacity probe refuses a database that is not explicitly disposable", () => {
  assertRefused(runBench({
    EPER_CAPACITY_BENCH_DATABASE_URL: "postgres://bench:secret-not-to-print@127.0.0.1:5432/eper",
  }), "BENCHMARK_REFUSED");
});

test("capacity probe refuses a non-loopback API target", () => {
  assertRefused(runBench({ EPER_CAPACITY_BENCH_API_URL: "https://api.example.test" }), "BENCHMARK_REFUSED");
});

test("capacity probe refuses credentials embedded in the API URL", () => {
  assertRefused(runBench({
    EPER_CAPACITY_BENCH_API_URL: "http://bench:secret-not-to-print@127.0.0.1:8080",
  }), "BENCHMARK_API_URL_CREDENTIALS_NOT_ALLOWED");
});

test("capacity probe refuses protocol-relative or malformed API paths", () => {
  assertRefused(runBench({ EPER_CAPACITY_BENCH_PATH: "//127.0.0.1:8080/customer/applications" }), "BENCHMARK_API_PATH_INVALID");
});

test("capacity probe refuses health-only routes", () => {
  assertRefused(runBench({ EPER_CAPACITY_BENCH_PATH: "/health" }), "BENCHMARK_REFUSED");
});

test("capacity probe refuses write methods before opening a database connection", () => {
  assertRefused(runBench({ EPER_CAPACITY_BENCH_METHOD: "POST" }), /Only GET and HEAD are currently supported/);
});

test("capacity probe rejects out-of-range concurrency before opening a database connection", () => {
  assertRefused(runBench({ EPER_CAPACITY_BENCH_CONCURRENCY: "101" }), "BENCHMARK_PARAMETERS_INVALID");
});
