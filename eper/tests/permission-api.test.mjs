import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../dist/apps/api/server.js";

const keys = [
  "EPER_LOCAL_PERMISSION_API", "EPER_LOCAL_PERMISSION_TOKEN",
  "EPER_LOCAL_PERMISSION_TENANT_ID", "EPER_LOCAL_PERMISSION_APPLICATION_ID",
  "EPER_LOCAL_PERMISSION_ENVIRONMENT", "EPER_LOCAL_PERMISSION_ACTOR_ID",
  "EPER_LOCAL_PERMISSION_GRANTS_FILE", "EPER_LOCAL_PERMISSION_AUDIT_FILE",
  "EPER_CAPABILITY_PERSISTENCE",
];

async function withServer(run) {
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const directory = mkdtempSync(join(tmpdir(), "eper-permission-http-"));
  const grantsFile = join(directory, "grants.json");
  const auditFile = join(directory, "audit.jsonl");
  const token = "local-test-token-that-is-at-least-32-characters";
  const scope = { tenantId: "tenant-a", applicationId: "app-a", environment: "uat" };
  writeFileSync(grantsFile, JSON.stringify([{
    ...scope, principalId: "admin-a", actions: ["permission:manage"],
    effect: "ALLOW", active: true,
  }]));
  Object.assign(process.env, {
    EPER_LOCAL_PERMISSION_API: "true",
    EPER_LOCAL_PERMISSION_TOKEN: token,
    EPER_LOCAL_PERMISSION_TENANT_ID: scope.tenantId,
    EPER_LOCAL_PERMISSION_APPLICATION_ID: scope.applicationId,
    EPER_LOCAL_PERMISSION_ENVIRONMENT: scope.environment,
    EPER_LOCAL_PERMISSION_ACTOR_ID: "admin-a",
    EPER_LOCAL_PERMISSION_GRANTS_FILE: grantsFile,
    EPER_LOCAL_PERMISSION_AUDIT_FILE: auditFile,
    EPER_CAPABILITY_PERSISTENCE: "memory",
  });
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run({ baseUrl, token, scope, grantsFile, auditFile });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
    rmSync(directory, { recursive: true, force: true });
  }
}

test("permission API rejects missing and incorrect bearer tokens", async () => {
  await withServer(async ({ baseUrl }) => {
    const missing = await fetch(`${baseUrl}/internal/permissions/user-b`);
    assert.equal(missing.status, 401);
    const wrong = await fetch(`${baseUrl}/internal/permissions/user-b`, {
      headers: { authorization: "Bearer wrong" },
    });
    assert.equal(wrong.status, 401);
  });
});

test("permission API reads exact-scope grants and rejects cross-scope mutation", async () => {
  await withServer(async ({ baseUrl, token, grantsFile }) => {
    const read = await fetch(`${baseUrl}/internal/permissions/user-b`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(read.status, 200);
    assert.deepEqual((await read.json()).grants, []);

    const crossScope = await fetch(`${baseUrl}/internal/permissions/user-b`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ grants: [{
        tenantId: "tenant-a", applicationId: "app-other", environment: "uat",
        principalId: "user-b", actions: ["run:read"], effect: "ALLOW", active: true,
      }] }),
    });
    assert.equal(crossScope.status, 400);
    const saved = JSON.parse(readFileSync(grantsFile, "utf8"));
    assert.equal(saved.some((grant) => grant.applicationId === "app-other"), false);
  });
});

test("permission API saves grants and appends an audit event", async () => {
  await withServer(async ({ baseUrl, token, auditFile }) => {
    const response = await fetch(`${baseUrl}/internal/permissions/user-b`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ grants: [{
        tenantId: "tenant-a", applicationId: "app-a", environment: "uat",
        principalId: "user-b", actions: ["run:read", "receipt:download"],
        effect: "ALLOW", active: true,
      }] }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.grants.length, 1);
    assert.equal(body.auditEvent.action, "permission.grants.replaced");
    const lines = readFileSync(auditFile, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).targetPrincipalId, "user-b");
  });
});

test("permission API denies grant reads and writes when actor lacks permission:manage", async () => {
  await withServer(async ({ baseUrl, token, grantsFile }) => {
    writeFileSync(grantsFile, JSON.stringify([]));
    const read = await fetch(`${baseUrl}/internal/permissions/user-b`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(read.status, 403);

    const write = await fetch(`${baseUrl}/internal/permissions/user-b`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ grants: [{
        tenantId: "tenant-a", applicationId: "app-a", environment: "uat",
        principalId: "user-b", actions: ["run:read"], effect: "ALLOW", active: true,
      }] }),
    });
    assert.equal(write.status, 403);
    assert.deepEqual(JSON.parse(readFileSync(grantsFile, "utf8")), []);
  });
});
