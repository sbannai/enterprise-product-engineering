import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../dist/apps/worker/customer-asset-upload-expiry-main.js", import.meta.url));
function run(overrides) {
  return spawnSync(process.execPath, [entrypoint], {
    env: { ...process.env, ...overrides }, encoding: "utf8", timeout: 10_000,
  });
}
test("expiry worker remains disabled by default", () => {
  const result = run({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED: "false",
    EPER_CUSTOMER_ASSET_PERSISTENCE: "postgres", EPER_AUDIT_PERSISTENCE: "postgres",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_DISABLED/);
});
test("expiry worker rejects missing tenant registry before creating a database pool", () => {
  const result = run({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED: "true",
    EPER_CUSTOMER_ASSET_PERSISTENCE: "postgres", EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPES_JSON: "",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPES_REQUIRED/);
});
test("expiry worker rejects unsafe backoff configuration before opening the pool", () => {
  const result = run({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED: "true",
    EPER_CUSTOMER_ASSET_PERSISTENCE: "postgres", EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPES_JSON: JSON.stringify([
      { tenantId: "tenant-a", applicationId: "app-a", environment: "sandbox" },
    ]),
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POLL_INTERVAL_MS: "5000",
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_MAX_BACKOFF_MS: "1000",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_MAX_BACKOFF_MS_OUT_OF_RANGE/);
});
