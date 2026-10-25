import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const TOKEN_A = "tenant-a-admin-credential-that-is-at-least-32-characters";
const TOKEN_B = "tenant-b-admin-credential-that-is-at-least-32-characters";

test("durable admin API resolves tenant and actor only from server-side credential mapping", async () => {
  const keys = ["EPER_ADMIN_CONFIG_API_ENABLED", "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_ADMIN_CONFIG_IDENTITIES_JSON", "EPER_ADMIN_CONFIG_API_TOKEN"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]));
  Object.assign(process.env, {
    EPER_ADMIN_CONFIG_API_ENABLED: "true",
    EPER_ADMIN_CONFIG_PERSISTENCE: "postgres",
    EPER_ADMIN_CONFIG_IDENTITIES_JSON: JSON.stringify({
      [TOKEN_A]: { tenantId: "tenant-a", actorId: "admin-a" },
      [TOKEN_B]: { tenantId: "tenant-b", actorId: "admin-b" },
    }),
    EPER_ADMIN_CONFIG_API_TOKEN: "legacy-shared-token-that-must-not-be-used-in-durable-mode",
  });
  const configs = new Map();
  const writes = [];
  const store = {
    async get(tenantId, resourceType) {
      return configs.get(tenantId + ":" + resourceType) ?? null;
    },
    async replace(input) {
      writes.push(input);
      const key = input.tenantId + ":" + input.resourceType;
      const current = configs.get(key);
      const version = current?.version ?? 0;
      if (version !== input.expectedVersion) {
        const error = new Error("ADMIN_CONFIGURATION_VERSION_CONFLICT");
        error.currentVersion = version;
        throw error;
      }
      const saved = {
        tenantId: input.tenantId, resourceType: input.resourceType, config: input.config,
        version: version + 1, updatedAt: "2026-10-25T12:00:00.000Z", updatedBy: input.actorId,
      };
      configs.set(key, saved);
      return saved;
    },
  };
  const server = createAppServer({ adminConfigurationStore: store });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${base}/admin/config/roles-access`, {
      method: "PUT",
      headers: { authorization: `Bearer ${TOKEN_A}`, "content-type": "application/json", "x-tenant-id": "tenant-b" },
      body: JSON.stringify({ tenantId: "tenant-b", actorId: "admin-b", expectedVersion: 0, roles: [] }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.version, 1);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].tenantId, "tenant-a");
    assert.equal(writes[0].actorId, "admin-a");

    const tenantA = await fetch(`${base}/admin/config/roles-access`, {
      headers: { authorization: `Bearer ${TOKEN_A}` },
    });
    const tenantB = await fetch(`${base}/admin/config/roles-access`, {
      headers: { authorization: `Bearer ${TOKEN_B}` },
    });
    assert.deepEqual((await tenantA.json()).roles, []);
    assert.deepEqual((await tenantB.json()).roles, []);
    assert.equal((await tenantB.json().catch(() => null))?.version, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("durable admin API rejects unmapped credentials even when legacy shared token exists", async () => {
  const keys = ["EPER_ADMIN_CONFIG_API_ENABLED", "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_ADMIN_CONFIG_IDENTITIES_JSON", "EPER_ADMIN_CONFIG_API_TOKEN"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_ADMIN_CONFIG_API_ENABLED: "true",
    EPER_ADMIN_CONFIG_PERSISTENCE: "postgres",
    EPER_ADMIN_CONFIG_IDENTITIES_JSON: JSON.stringify({ [TOKEN_A]: { tenantId: "tenant-a", actorId: "admin-a" } }),
    EPER_ADMIN_CONFIG_API_TOKEN: TOKEN_B,
  });
  const server = createAppServer({ adminConfigurationStore: { async get() { throw new Error("must not be called"); }, async replace() { throw new Error("must not be called"); } } });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/admin/config/roles-access`, {
      headers: { authorization: `Bearer ${TOKEN_B}` },
    });
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
