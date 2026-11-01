import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workerEntry = resolve(process.cwd(), "dist/apps/worker/campaign-scheduler-main.js");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function runWorker(overrides = {}) {
  const env = {
    ...process.env,
    EPER_CAMPAIGN_SCHEDULER_WORKER_ENABLED: "true",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CAMPAIGN_SCHEDULER_WORKER_ID: "worker-entrypoint-test",
    EPER_WORKER_ADAPTER_PLACEHOLDER: "unused",
    EPER_CAMPAIGN_WORKER_ADAPTER_MODULE: "./dist/packages/campaign-scheduler/adapters/test-adapter.js",
    EPER_AUDIT_ENVIRONMENT: "sandbox",
    EPER_PAYMENT_DATABASE_URL: "",
    DATABASE_URL: "",
    ...overrides,
  };
  return spawnSync(process.execPath, [workerEntry], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    timeout: 5000,
  });
}

function assertRefused(overrides, expectedCode) {
  const result = runWorker(overrides);
  assert.equal(result.error, undefined, result.error?.message);
  assert.notEqual(result.status, 0, "worker entrypoint must fail closed");
  assert.match(
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    new RegExp(expectedCode),
  );
}

test("campaign worker npm command targets the compiled dedicated entrypoint", () => {
  assert.equal(
    packageJson.scripts["start:campaign-worker"],
    "node dist/apps/worker/campaign-scheduler-main.js",
  );
});

test("campaign worker refuses to start unless explicitly enabled", () => {
  assertRefused({ EPER_CAMPAIGN_SCHEDULER_WORKER_ENABLED: "false" }, "EPER_CAMPAIGN_SCHEDULER_WORKER_DISABLED");
});

test("campaign worker requires durable PostgreSQL audit before startup", () => {
  assertRefused({ EPER_AUDIT_PERSISTENCE: "json-file" }, "CAMPAIGN_WORKER_REQUIRES_DURABLE_AUDIT");
});

test("campaign worker requires an explicit worker identity", () => {
  assertRefused({ EPER_CAMPAIGN_SCHEDULER_WORKER_ID: "  " }, "EPER_CAMPAIGN_SCHEDULER_WORKER_ID_REQUIRED");
});

test("campaign worker rejects adapter paths that escape the deployment-owned adapter directory", () => {
  assertRefused(
    { EPER_CAMPAIGN_WORKER_ADAPTER_MODULE: "./dist/packages/campaign-scheduler/adapters/../../outside.js" },
    "CAMPAIGN_WORKER_ADAPTER_PATH_INVALID",
  );
});

test("campaign worker rejects unsupported audit environments before opening its pool", () => {
  assertRefused({ EPER_AUDIT_ENVIRONMENT: "development" }, "EPER_AUDIT_ENVIRONMENT_INVALID");
});
