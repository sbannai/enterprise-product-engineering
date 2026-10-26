import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("single-call client assets API returns tenant/application-scoped asset metadata", async () => {
  const keys = [
    "EPER_CUSTOMER_ASSETS_API_ENABLED",
    "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON",
    "EPER_CUSTOMER_WORKSPACE_MODULES_JSON",
    "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON",
    "EPER_CUSTOMER_APPLICATION_ASSETS_JSON",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const tokenA = "client-assets-tenant-a-token-000000000000000001";
  const tokenB = "client-assets-tenant-b-token-000000000000000002";
  process.env.EPER_CUSTOMER_ASSETS_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [tokenA]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer-admin" },
    [tokenB]: { tenantId: "tenant-b", actorId: "actor-b", roleKey: "customer-admin" },
  });
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({
    "tenant-a": ["client-assets"],
    "tenant-b": [],
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({
    "tenant-a": ["app-a"],
    "tenant-b": ["app-b"],
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSETS_JSON = JSON.stringify({
    "tenant-a": {
      "app-a": [
        { id: "doc-1", name: "Project brief.pdf", type: "document", mimeType: "application/pdf", sizeBytes: 2048, tags: ["brief"], accessReference: "blobref:opaque-1", internalSecret: "must-not-leak" },
        { id: "vid-1", name: "Demo.mp4", type: "video", accessReference: "blobref:opaque-2" },
      ],
    },
    "tenant-b": { "app-b": [{ id: "private-1", name: "Private.pdf", type: "document", accessReference: "blobref:private" }] },
  });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = "http://127.0.0.1:" + address.port;
    const endpoint = base + "/customer/applications/app-a/assets";
    assert.equal((await fetch(endpoint)).status, 401);
    const response = await fetch(endpoint, { headers: { authorization: "Bearer " + tokenA } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.applicationId, "app-a");
    assert.equal(body.total, 2);
    assert.equal(body.nextCursor, null);
    assert.deepEqual(body.assets.map((asset) => asset.id), ["doc-1", "vid-1"]);
    assert.equal(body.assets[0].accessReference, "blobref:opaque-1");
    assert.equal("internalSecret" in body.assets[0], false);
    assert.equal((await fetch(base + "/customer/applications/app-b/assets", {
      headers: { authorization: "Bearer " + tokenA, "x-tenant-id": "tenant-b" },
    })).status, 403);
    assert.equal((await fetch(base + "/customer/applications/app-b/assets", {
      headers: { authorization: "Bearer " + tokenB },
    })).status, 403);
    const invalidCursor = await fetch(endpoint + "?cursor=-1", { headers: { authorization: "Bearer " + tokenA } });
    assert.equal(invalidCursor.status, 400);
    process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({ "tenant-a": ["help-center"] });
    const disabled = await fetch(endpoint, { headers: { authorization: "Bearer " + tokenA } });
    assert.equal(disabled.status, 403);
    assert.deepEqual(await disabled.json(), { error: "customer_assets_not_enabled" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
