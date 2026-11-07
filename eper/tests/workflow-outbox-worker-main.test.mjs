import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const workerMain = fileURLToPath(new URL("../dist/apps/worker/workflow-outbox-main.js", import.meta.url));

function runWorker(env) {
  return spawnSync(process.execPath, [workerMain], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    timeout: 10_000,
  });
}

test("standalone workflow worker exits before database access when explicit opt-in is absent", () => {
  const env = { ...process.env, EPER_WORKFLOW_OUTBOX_WORKER_ENABLED: "false" };
  delete env.EPER_WORKFLOW_OUTBOX_DATABASE_URL;
  const result = runWorker(env);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /EPER_WORKFLOW_OUTBOX_WORKER_DISABLED/);
});

test("standalone workflow worker rejects incomplete configuration before opening a database pool", () => {
  const env = {
    ...process.env,
    EPER_WORKFLOW_OUTBOX_WORKER_ENABLED: "true",
    EPER_AUDIT_PERSISTENCE: "postgres",
  };
  delete env.EPER_WORKFLOW_OUTBOX_DATABASE_URL;
  const result = runWorker(env);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /EPER_WORKFLOW_OUTBOX_DATABASE_URL_REQUIRED/);
});
