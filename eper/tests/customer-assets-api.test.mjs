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
    "tenant-a": ["app-a", "app-c", "app-empty"],
    "tenant-b": ["app-b"],
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSETS_JSON = JSON.stringify({
    "tenant-a": {
      "app-a": [
        { id: "doc-1", name: "Project brief.pdf", type: "document", mimeType: "application/pdf", sizeBytes: 2048, tags: ["brief"], accessReference: "blobref:opaque-1", internalSecret: "must-not-leak" },
        { id: "vid-1", name: "Demo.mp4", type: "video", accessReference: "blobref:opaque-2" },
      ],
      "app-c": [{ id: "img-1", name: "Brand mark.png", type: "image", accessReference: "blobref:opaque-3" }],
      "app-empty": [],
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
    const endpoint = base + "/customer/assets";
    assert.equal((await fetch(endpoint)).status, 401);
    const response = await fetch(endpoint, { headers: { authorization: "Bearer " + tokenA } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.total, 3);
    assert.equal(body.nextCursor, null);
    assert.deepEqual(body.assets.map((asset) => asset.id), ["doc-1", "vid-1", "img-1"]);
    assert.deepEqual(body.assets.map((asset) => asset.applicationId), ["app-a", "app-a", "app-c"]);
    assert.equal(body.applicationCount, 2);
    const fullManifestResponse = await fetch(endpoint + "?all=true", { headers: { authorization: "Bearer " + tokenA } });
    assert.equal(fullManifestResponse.status, 200);
    const fullManifest = await fullManifestResponse.json();
    assert.equal(fullManifest.assets.length, fullManifest.total);
    assert.equal(fullManifest.nextCursor, null, "all=true returns the complete manifest in one request");
    assert.deepEqual(fullManifest.assets.map((asset) => asset.id), ["doc-1", "vid-1", "img-1"]);
    const conflictingPagination = await fetch(endpoint + "?all=true&cursor=0", { headers: { authorization: "Bearer " + tokenA } });
    assert.equal(conflictingPagination.status, 400, "full-manifest mode cannot silently mix with pagination");
    assert.equal("accessReference" in body.assets[0], false, "storage references must remain server-side until authorized download is implemented");
    assert.equal("internalSecret" in body.assets[0], false);
    assert.equal(body.assets.some((asset) => asset.id === "private-1"), false, "assets from other tenants must never be included");
    const otherTenant = await fetch(endpoint, { headers: { authorization: "Bearer " + tokenB } });
    assert.equal(otherTenant.status, 403);
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


test("asset download rechecks tenant/application access and requires an audited short-lived HTTPS URL", async () => {
  const keys = ["EPER_CUSTOMER_ASSETS_API_ENABLED", "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", "EPER_CUSTOMER_WORKSPACE_MODULES_JSON", "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON", "EPER_CUSTOMER_APPLICATION_ASSETS_JSON", "EPER_ASSET_STORAGE_ALLOWED_HOSTS_JSON"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const tokenA = "client-assets-download-tenant-a-token-000000000000";
  const tokenB = "client-assets-download-tenant-b-token-000000000000";
  process.env.EPER_CUSTOMER_ASSETS_API_ENABLED = "true";
  process.env.EPER_ASSET_STORAGE_ALLOWED_HOSTS_JSON = JSON.stringify(["storage.example.test"]);
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [tokenA]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer-admin" },
    [tokenB]: { tenantId: "tenant-b", actorId: "actor-b", roleKey: "customer-admin" },
  });
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({ "tenant-a": ["client-assets"], "tenant-b": ["client-assets"] });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"], "tenant-b": ["app-b"] });
  process.env.EPER_CUSTOMER_APPLICATION_ASSETS_JSON = JSON.stringify({
    "tenant-a": { "app-a": [{ id: "doc-1", name: "Project brief.pdf", type: "document", mimeType: "application/pdf", accessReference: "blobref:private-a" }] },
    "tenant-b": { "app-b": [{ id: "doc-1", name: "Other tenant.pdf", type: "document", accessReference: "blobref:private-b" }] },
  });
  const audit = [];
  const expectedCorrelationId = "asset-download-regression-001";
  let markAuditStarted;
  const auditStarted = new Promise((resolve) => { markAuditStarted = resolve; });
  let releaseAudit;
  const auditGate = new Promise((resolve) => { releaseAudit = resolve; });
  const server = createAppServer({
    assetStoragePort: {
      invoke: async (input, correlationId) => {
        assert.equal(input.tenantId, "tenant-a");
        assert.equal(input.accessReference, "blobref:private-a");
        assert.equal(correlationId, expectedCorrelationId);
        return { success: true, value: { url: "https://storage.example.test/signed?token=short-lived", expiresAt: new Date(Date.now() + 60_000).toISOString() } };
      },
    },
    assetAuditWriter: async (record) => {
      if (record.outcome === "success") { markAuditStarted(); await auditGate; }
      audit.push(record);
    },
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = "http://127.0.0.1:" + address.port;
    let responseSettled = false;
    const pendingResponse = fetch(base + "/customer/applications/app-a/assets/doc-1/download", { headers: { authorization: "Bearer " + tokenA, "x-correlation-id": expectedCorrelationId } });
    pendingResponse.then(() => { responseSettled = true; });
    await auditStarted;
    assert.equal(responseSettled, false, "download response must wait for durable audit completion");
    releaseAudit();
    const ok = await pendingResponse;
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.downloadUrl, "https://storage.example.test/signed?token=short-lived");
    assert.equal(body.fileName, "Project brief.pdf");
    assert.equal("accessReference" in body, false);
    assert.equal(audit[0].outcome, "success");
    assert.equal(audit[0].tenantId, "tenant-a");
    assert.equal(audit[0].requestId, expectedCorrelationId);
    assert.equal(ok.headers.get("x-request-id"), expectedCorrelationId);
    const denied = await fetch(base + "/customer/applications/app-b/assets/doc-1/download", { headers: { authorization: "Bearer " + tokenA, "x-correlation-id": "asset-download-denied-002" } });
    assert.equal(denied.status, 404);
    assert.equal(audit[1].outcome, "denied");
    assert.equal(audit[1].tenantId, "tenant-a");
    assert.equal(audit[1].requestId, "asset-download-denied-002");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});

test("asset download records failure when no storage provider is configured", async () => {
  const keys = ["EPER_CUSTOMER_ASSETS_API_ENABLED", "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", "EPER_CUSTOMER_WORKSPACE_MODULES_JSON", "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON", "EPER_CUSTOMER_APPLICATION_ASSETS_JSON"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const credential = "client-assets-provider-missing-token-1234567890";
  process.env.EPER_CUSTOMER_ASSETS_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
  });
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({ "tenant-a": ["client-assets"] });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  process.env.EPER_CUSTOMER_APPLICATION_ASSETS_JSON = JSON.stringify({
    "tenant-a": { "app-a": [{ id: "doc-1", name: "Project brief.pdf", type: "document", accessReference: "blobref:private-a" }] },
  });
  const audit = [];
  const server = createAppServer({ assetAuditWriter: async (record) => { audit.push(record); } });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port + "/customer/applications/app-a/assets/doc-1/download", {
      headers: { authorization: "Bearer " + credential },
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "asset_storage_provider_unavailable" });
    assert.equal(audit.length, 1);
    assert.equal(audit[0].outcome, "failure");
    assert.equal(audit[0].tenantId, "tenant-a");
    assert.equal(audit[0].assetId, "doc-1");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});

test("asset download fails closed when durable audit persistence fails", async () => {
  const keys = ["EPER_CUSTOMER_ASSETS_API_ENABLED", "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", "EPER_CUSTOMER_WORKSPACE_MODULES_JSON", "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON", "EPER_CUSTOMER_APPLICATION_ASSETS_JSON", "EPER_ASSET_STORAGE_ALLOWED_HOSTS_JSON"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const credential = "client-assets-audit-failure-token-1234567890";
  process.env.EPER_CUSTOMER_ASSETS_API_ENABLED = "true";
  process.env.EPER_ASSET_STORAGE_ALLOWED_HOSTS_JSON = JSON.stringify(["storage.example.test"]);
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({ [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" } });
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({ "tenant-a": ["client-assets"] });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  process.env.EPER_CUSTOMER_APPLICATION_ASSETS_JSON = JSON.stringify({ "tenant-a": { "app-a": [{ id: "doc-1", name: "Project brief.pdf", type: "document", accessReference: "blobref:private-a" }] } });
  let providerCalls = 0;
  const server = createAppServer({
    assetStoragePort: { invoke: async () => { providerCalls += 1; return { success: true, value: { url: "https://storage.example.test/signed?token=must-not-leak", expiresAt: new Date(Date.now() + 60_000).toISOString() } }; } },
    assetAuditWriter: async () => { throw new Error("durable audit store unavailable"); },
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port + "/customer/applications/app-a/assets/doc-1/download", { headers: { authorization: "Bearer " + credential } });
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.equal(body.includes("must-not-leak"), false);
    assert.equal(body.includes("downloadUrl"), false);
    assert.equal(providerCalls, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
test("asset download rejects unsafe or overlong provider URLs and audits the failure", async () => {
  const keys = ["EPER_CUSTOMER_ASSETS_API_ENABLED", "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", "EPER_CUSTOMER_WORKSPACE_MODULES_JSON", "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON", "EPER_CUSTOMER_APPLICATION_ASSETS_JSON"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const credential = "client-assets-invalid-provider-token-123456789";
  process.env.EPER_CUSTOMER_ASSETS_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({ [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" } });
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({ "tenant-a": ["client-assets"] });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  process.env.EPER_CUSTOMER_APPLICATION_ASSETS_JSON = JSON.stringify({ "tenant-a": { "app-a": [{ id: "doc-1", name: "Project brief.pdf", type: "document", accessReference: "blobref:private-a" }] } });
  try {
    for (const descriptor of [
      { url: "http://storage.example.test/file", expiresAt: new Date(Date.now() + 60_000).toISOString() },
      { url: "https://storage.example.test/file", expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() },
    ]) {
      const audit = [];
      const server = createAppServer({
        assetDownloadResolver: async () => descriptor,
        assetAuditWriter: async (record) => { audit.push(record); },
      });
      try {
        await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
        const address = server.address();
        assert.ok(address && typeof address === "object");
        const response = await fetch("http://127.0.0.1:" + address.port + "/customer/applications/app-a/assets/doc-1/download", {
          headers: { authorization: "Bearer " + credential },
        });
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: "asset_storage_provider_unavailable" });
        assert.equal(audit.length, 1);
        assert.equal(audit[0].outcome, "failure");
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
