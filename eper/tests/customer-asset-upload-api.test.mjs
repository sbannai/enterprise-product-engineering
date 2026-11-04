import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("customer upload reservation requires identity, assignment, provider and durable audit", async () => {
  const keys = [
    "EPER_CUSTOMER_ASSETS_API_ENABLED", "EPER_CUSTOMER_ASSET_PERSISTENCE",
    "EPER_AUDIT_PERSISTENCE", "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON",
    "EPER_CUSTOMER_WORKSPACE_MODULES_JSON", "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const token = "customer-upload-route-test-token-000000000001";
  process.env.EPER_CUSTOMER_ASSETS_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ASSET_PERSISTENCE = "postgres";
  process.env.EPER_AUDIT_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer-admin", applicationIds: ["app-a"] },
  });
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({ "tenant-a": ["client-assets"] });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  const events = [];
  const server = createAppServer({
    customerAssetRepository: {
      async getPendingUploadAsset(tenantId, applicationId, assetId) {
        assert.deepEqual([tenantId, applicationId, assetId], ["tenant-a", "app-a", "asset-001"]);
        return { originalFileName: "proposal.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 8192 };
      },
      async reserveUpload(input) { events.push({ type: "reservation", input }); },
    },
    assetUploadResolver: async (input, requestId) => {
      events.push({ type: "provider", input, requestId });
      return {
        providerUploadReference: "provider-private-object-reference",
        url: "https://storage.example.test/upload?signature=private",
        method: "PUT", expiresAt: new Date(Date.now() + 60_000).toISOString(),
        headers: { "content-type": input.mimeType },
      };
    },
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const endpoint = "http://127.0.0.1:" + address.port + "/customer/applications/app-a/assets/asset-001/uploads";
    const body = {
      fileName: "proposal.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: 8192,
      idempotencyKey: "customer-upload-idempotency-0001",
    };
    const unauthorized = await fetch(endpoint, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    assert.equal(unauthorized.status, 401);
    assert.equal(events.length, 0);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json", "x-correlation-id": "upload-api-correlation-001" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.upload.method, "PUT");
    assert.equal(result.upload.url, "https://storage.example.test/upload?signature=private");
    assert.equal(result.upload.uploadSessionId, events[1].input.uploadSessionId);
    assert.deepEqual(events.map((event) => event.type), ["provider", "reservation"]);
    assert.equal(events[0].input.tenantId, "tenant-a");
    assert.equal(events[0].input.applicationId, "app-a");
    assert.equal(events[1].input.providerUploadReference, "provider-private-object-reference");
    assert.equal(events[1].input.correlationId, "upload-api-correlation-001");
    assert.equal("providerUploadReference" in result.upload, false);
    assert.equal(JSON.stringify(result).includes("provider-private-object-reference"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});

test("customer upload reservation fails closed when provider or repository configuration is absent", async () => {
  const keys = ["EPER_CUSTOMER_ASSETS_API_ENABLED", "EPER_CUSTOMER_ASSET_PERSISTENCE", "EPER_AUDIT_PERSISTENCE",
    "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", "EPER_CUSTOMER_WORKSPACE_MODULES_JSON", "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const token = "customer-upload-unconfigured-token-00000000001";
  process.env.EPER_CUSTOMER_ASSETS_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ASSET_PERSISTENCE = "postgres";
  process.env.EPER_AUDIT_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({ [token]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer-admin", applicationIds: ["app-a"] } });
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({ "tenant-a": ["client-assets"] });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  const server = createAppServer({ customerAssetRepository: { async getPendingUploadAsset() { throw new Error("must not run"); }, async reserveUpload() { throw new Error("must not run"); } } });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port + "/customer/applications/app-a/assets/asset-001/uploads", {
      method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 100, idempotencyKey: "customer-upload-idempotency-0002" }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "asset_upload_provider_or_durable_store_unavailable" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
