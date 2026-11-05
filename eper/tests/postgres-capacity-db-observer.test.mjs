import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const eperRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = resolve(eperRoot, "scripts/postgres-capacity-db-observer.mjs");
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("EPER_CAPACITY_BENCH_")),
);

function runObserver(overrides = {}) {
  const env = {
    ...cleanEnv,
    EPER_CAPACITY_BENCH_DATABASE_URL: "postgres://bench:secret-not-to-print@127.0.0.1:5432/eper_bench",
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
  assert.doesNotMatch(result.stdout + result.stderr, /secret-not-to-print|198\.51\.100\.9/);
}

test("PostgreSQL observer requires an explicit disposable database", () => {
  assertRefused(runObserver({ EPER_CAPACITY_BENCH_DATABASE_URL: "" }), "EPER_CAPACITY_BENCH_DATABASE_URL_REQUIRED");
});

test("PostgreSQL observer refuses remote hosts", () => {
  assertRefused(runObserver({
    EPER_CAPACITY_BENCH_DATABASE_URL: "postgres://bench:secret-not-to-print@198.51.100.9:5432/eper_bench",
  }), "BENCHMARK_REFUSED");
});

test("PostgreSQL observer refuses driver query overrides", () => {
  assertRefused(runObserver({
    EPER_CAPACITY_BENCH_DATABASE_URL: "postgres://bench:secret-not-to-print@127.0.0.1:5432/eper_bench?host=198.51.100.9",
  }), "BENCHMARK_DATABASE_URL_OPTIONS_UNSUPPORTED");
});

test("PostgreSQL observer refuses non-disposable database names", () => {
  assertRefused(runObserver({
    EPER_CAPACITY_BENCH_DATABASE_URL: "postgres://bench:secret-not-to-print@127.0.0.1:5432/eper",
  }), "BENCHMARK_REFUSED");
});

test("PostgreSQL observer bounds sample interval and duration before connecting", () => {
  assertRefused(runObserver({ EPER_CAPACITY_BENCH_SAMPLE_INTERVAL_MS: "10" }), "BENCHMARK_OBSERVER_PARAMETERS_INVALID");
});
