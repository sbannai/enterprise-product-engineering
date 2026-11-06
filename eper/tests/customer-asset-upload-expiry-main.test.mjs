import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../dist/apps/worker/customer-asset-upload-expiry-main.js", import.meta.url));

function runWith(envOverrides) {
  const env = { ...process.env, ...envOverrides };
  return spawnSync(process.execPath, [entrypoint], { env, encoding: "utf8", timeout: 10_000 });
}

test("upload expiry worker is disabled by default", () => {
  const result = runWith({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED: "false",
    EPER_CUSTOMER_ASSET_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_DISABLED/);
});

test("upload expiry worker rejects an absent tenant scope registry before opening a pool", () => {
  const result = runWith({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED: "true",
    EPER_CUSTOMER_ASSET_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPES_JSON: "",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPES_REQUIRED/);
});

test("upload expiry worker rejects non-PostgreSQL persistence before opening a pool", () => {
  const result = runWith({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED: "true",
    EPER_CUSTOMER_ASSET_PERSISTENCE: "mysql",
    EPER_AUDIT_PERSISTENCE: "postgres",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_REQUIRES_POSTGRES/);
});
