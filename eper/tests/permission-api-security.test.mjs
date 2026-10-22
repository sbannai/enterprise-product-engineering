import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../dist/apps/api/server.js";

const servers = [];
const tempDirs = [];
const configKeys = [
  "EPER_LOCAL_PERMISSION_API",
  "EPER_LOCAL_PERMISSION_TOKEN",
  "EPER_LOCAL_PERMISSION_TENANT_ID",
  "EPER_LOCAL_PERMISSION_APPLICATION_ID",
  "EPER_LOCAL_PERMISSION_ENVIRONMENT",
  "EPER_LOCAL_PERMISSION_ACTOR_ID",
  "EPER_LOCAL_PERMISSION_GRANTS_FILE",
  "EPER_LOCAL_PERMISSION_AUDIT_FILE",
];
const previous = Object.fromEntries(configKeys.map((key) => [key, process.env[key]]));

function restoreConfig() {
  for (const key of configKeys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

afterEach(async () => {
  restoreConfig();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

async function startServer() {
  const server = createAppServer();
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

function configurePermissionApi() {
  const dir = mkdtempSync(join(tmpdir(), "eper-permission-api-"));
  tempDirs.push(dir);
  Object.assign(process.env, {
    EPER_LOCAL_PERMISSION_API: "true",
    EPER_LOCAL_PERMISSION_TOKEN: "permission-test-token-0123456789-0123456789",
    EPER_LOCAL_PERMISSION_TENANT_ID: "tenant-test",
    EPER_LOCAL_PERMISSION_APPLICATION_ID: "app-test",
    EPER_LOCAL_PERMISSION_ENVIRONMENT: "test",
    EPER_LOCAL_PERMISSION_ACTOR_ID: "admin-test",
    EPER_LOCAL_PERMISSION_GRANTS_FILE: join(dir, "grants.json"),
    EPER_LOCAL_PERMISSION_AUDIT_FILE: join(dir, "audit.jsonl"),
  });
}

test("permission API is disabled by default", async () => {
  restoreConfig();
  delete process.env.EPER_LOCAL_PERMISSION_API;
  const response = await fetch(`${await startServer()}/internal/permissions/user-test`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not_found" });
});

test("permission API fails closed when required server configuration is incomplete", async () => {
  configurePermissionApi();
  delete process.env.EPER_LOCAL_PERMISSION_AUDIT_FILE;
  const response = await fetch(`${await startServer()}/internal/permissions/user-test`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "local_permission_api_unconfigured" });
});

test("permission API rejects requests without the configured bearer token", async () => {
  configurePermissionApi();
  const response = await fetch(`${await startServer()}/internal/permissions/user-test`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("permission API rejects malformed bearer credentials", async () => {
  configurePermissionApi();
  const response = await fetch(`${await startServer()}/internal/permissions/user-test`, {
    headers: { authorization: "Bearer wrong-token" },
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("permission API ignores client scope claims and rejects cross-tenant grant injection", async () => {
  configurePermissionApi();
  const scope = { tenantId: "tenant-test", applicationId: "app-test", environment: "test" };
  const managerGrant = {
    ...scope, principalId: "admin-test", actions: ["permission:manage"], effect: "ALLOW", active: true,
  };
  writeFileSync(process.env.EPER_LOCAL_PERMISSION_GRANTS_FILE, JSON.stringify([managerGrant]));
  const response = await fetch(`${await startServer()}/internal/permissions/user-test`, {
    method: "PUT",
    headers: {
      authorization: "Bearer permission-test-token-0123456789-0123456789",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      tenantId: "tenant-attacker",
      applicationId: "app-attacker",
      environment: "production",
      grants: [{
        tenantId: "tenant-attacker", applicationId: "app-attacker", environment: "production",
        principalId: "user-test", actions: ["receipt:download"], effect: "ALLOW", active: true,
      }],
    }),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "INVALID_GRANT_SET" });
  const persisted = JSON.parse(readFileSync(process.env.EPER_LOCAL_PERMISSION_GRANTS_FILE, "utf8"));
  assert.deepEqual(persisted, [managerGrant]);
});
