import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const TOKEN_A = "tenant-a-admin-credential-that-is-at-least-32-characters";
const TOKEN_B = "tenant-b-admin-credential-that-is-at-least-32-characters";

test("durable admin API resolves tenant and actor only from server-side credential mapping", async () => {
  const keys = ["EPER_ADMIN_CONFIG_API_ENABLED", "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_ADMIN_CONFIG_IDENTITIES_JSON", "EPER_ADMIN_CONFIG_API_TOKEN"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
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
      body: JSON.stringify({ tenantId: "tenant-b", actorId: "admin-b", expectedVersion: 0, roles: [{ id: "finance", name: "Finance", members: ["payer-1"], permissions: ["workflow:view"] }] }),
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
    const tenantAData = await tenantA.json();
    const tenantBData = await tenantB.json();
    assert.equal(tenantAData.roles[0].id, "finance");
    assert.equal(tenantAData.version, 1);
    assert.deepEqual(tenantBData.roles, []);
    assert.equal(tenantBData.version, 0);
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

test("durable pricing reads the authenticated tenant's persisted price book", async () => {
  const keys = [
    "EPER_ADMIN_CONFIG_API_ENABLED", "EPER_ADMIN_CONFIG_PERSISTENCE",
    "EPER_ADMIN_CONFIG_IDENTITIES_JSON", "EPER_PRICING_API_ENABLED",
    "EPER_PRICING_API_TOKEN", "EPER_MARKET_PRICE_BOOK_JSON",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_ADMIN_CONFIG_API_ENABLED: "true",
    EPER_ADMIN_CONFIG_PERSISTENCE: "postgres",
    EPER_ADMIN_CONFIG_IDENTITIES_JSON: JSON.stringify({
      [TOKEN_A]: { tenantId: "tenant-a", actorId: "admin-a" },
      [TOKEN_B]: { tenantId: "tenant-b", actorId: "admin-b" },
    }),
    EPER_PRICING_API_ENABLED: "true",
    // A shared pricing token must not override tenant identity in durable mode.
    EPER_PRICING_API_TOKEN: "legacy-shared-pricing-token-that-is-at-least-32-chars",
    EPER_MARKET_PRICE_BOOK_JSON: "[]",
  });
  const priceBooks = new Map([
    ["tenant-a:price-book", [{
      productId: "uat-fee", marketId: "IN", currency: "INR", amountMinor: 12550,
      priceBookId: "tenant-a-book", priceBookVersion: "v1", status: "APPROVED",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    }]],
    ["tenant-b:price-book", [{
      productId: "uat-fee", marketId: "IN", currency: "INR", amountMinor: 9900,
      priceBookId: "tenant-b-book", priceBookVersion: "v1", status: "APPROVED",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    }]],
  ]);
  const reads = [];
  const store = {
    async get(tenantId, resourceType) {
      reads.push({ tenantId, resourceType });
      const config = priceBooks.get(tenantId + ":" + resourceType);
      return config ? { tenantId, resourceType, config, version: 1 } : null;
    },
    async replace() { throw new Error("not used"); },
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
    const response = await fetch(`${base}/pricing/quote`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN_A}`, "content-type": "application/json" },
      body: JSON.stringify({ productId: "uat-fee", marketId: "IN" }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.quote.amountMinor, 12550);
    assert.equal(result.quote.priceBookId, "tenant-a-book");
    assert.ok(reads.some((read) => read.tenantId === "tenant-a" && read.resourceType === "price-book"));

    const unauthorized = await fetch(`${base}/pricing/quote`, {
      method: "POST",
      headers: { authorization: "Bearer legacy-shared-pricing-token-that-is-at-least-32-chars", "content-type": "application/json" },
      body: JSON.stringify({ productId: "uat-fee", marketId: "IN" }),
    });
    assert.equal(unauthorized.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("durable pricing returns 503 when the persisted price book store is unavailable", async () => {
  const keys = [
    "EPER_ADMIN_CONFIG_API_ENABLED", "EPER_ADMIN_CONFIG_PERSISTENCE",
    "EPER_ADMIN_CONFIG_IDENTITIES_JSON", "EPER_PRICING_API_ENABLED",
    "EPER_PRICING_API_TOKEN", "EPER_MARKET_PRICE_BOOK_JSON",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_ADMIN_CONFIG_API_ENABLED: "true",
    EPER_ADMIN_CONFIG_PERSISTENCE: "postgres",
    EPER_ADMIN_CONFIG_IDENTITIES_JSON: JSON.stringify({
      [TOKEN_A]: { tenantId: "tenant-a", actorId: "admin-a" },
    }),
    EPER_PRICING_API_ENABLED: "true",
    EPER_PRICING_API_TOKEN: "legacy-shared-pricing-token-that-is-at-least-32-chars",
    EPER_MARKET_PRICE_BOOK_JSON: "[]",
  });
  const store = {
    async get() { throw new Error("postgres connection unavailable"); },
    async replace() { throw new Error("not used"); },
  };
  const server = createAppServer({ adminConfigurationStore: store });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/pricing/quote`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN_A}`, "content-type": "application/json" },
      body: JSON.stringify({ productId: "uat-fee", marketId: "IN" }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "pricing_durable_store_unavailable" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
