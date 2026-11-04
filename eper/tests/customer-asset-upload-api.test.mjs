import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("customer upload reservation requires identity, assignment, provider and durable audit", async () => {
  const keys = [
    "EPER_CUSTOMER_ASSETS_API_ENABLED", "EPER_CUSTOMER_ASSET_PERSISTENCE",
    "EPER_AUDIT_PERSISTENCE", "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON",
    "EPER_CUSTOMER_WORKSPACE_MODULES_JSON", "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON", "EPER_ASSET_STORAGE_ALLOWED_HOSTS_JSON",
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
  process.env.EPER_ASSET_STORAGE_ALLOWED_HOSTS_JSON = JSON.stringify(["storage.example.test"]);
  const events = [];
  const server = createAppServer({
    customerAssetRepository: {
      async getPendingUploadAsset(tenantId, applicationId, assetId) {
        assert.deepEqual([tenantId, applicationId, assetId], ["tenant-a", "app-a", "asset-001"]);
        return { originalFileName: "proposal.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 8192 };
      },
      async reserveUpload(input) { events.push({ type: "reservation", input }); return input.uploadSessionId; },
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


test("customer asset metadata creation is tenant-derived, role-gated and audited through the repository", async () => {
  const keys = ["EPER_CUSTOMER_ASSETS_API_ENABLED", "EPER_CUSTOMER_ASSET_PERSISTENCE", "EPER_AUDIT_PERSISTENCE",
    "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", "EPER_CUSTOMER_WORKSPACE_MODULES_JSON",
    "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON", "EPER_CUSTOMER_ASSET_ALLOWED_MIME_TYPES_JSON",
    "EPER_CUSTOMER_ASSET_MAX_FILE_BYTES", "EPER_CUSTOMER_ASSET_STORAGE_ADAPTER_KEY"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const token = "customer-asset-create-test-token-00000000001";
  process.env.EPER_CUSTOMER_ASSETS_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ASSET_PERSISTENCE = "postgres";
  process.env.EPER_AUDIT_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-derived", actorId: "actor-admin", roleKey: "customer-admin", applicationIds: ["app-a"] },
  });
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({ "tenant-derived": ["client-assets"] });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-derived": ["app-a"] });
  process.env.EPER_CUSTOMER_ASSET_ALLOWED_MIME_TYPES_JSON = JSON.stringify([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  process.env.EPER_CUSTOMER_ASSET_MAX_FILE_BYTES = "10485760";
  process.env.EPER_CUSTOMER_ASSET_STORAGE_ADAPTER_KEY = "customer-storage";
  let created;
  const server = createAppServer({
    customerAssetRepository: {
      async create(input) {
        created = input;
        return {
          assetId: "asset-created-001", scope: input.scope, displayName: input.displayName,
          originalFileName: input.originalFileName, mimeType: input.mimeType,
          sizeBytes: input.sizeBytes, uploadStatus: "pending",
        };
      },
    },
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port + "/customer/assets", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json", "x-correlation-id": "asset-create-correlation-001" },
      body: JSON.stringify({
        applicationId: "app-a", scope: "customer_shared", displayName: "Project brief",
        originalFileName: "brief.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileExtension: "docx", mediaCategory: "document", sizeBytes: 4096,
        tenantId: "attacker-controlled-tenant",
      }),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.asset.assetId, "asset-created-001");
    assert.equal(body.asset.uploadStatus, "pending");
    assert.equal(created.tenantId, "tenant-derived");
    assert.equal(created.actorId, "actor-admin");
    assert.equal(created.applicationId, "app-a");
    assert.equal(created.scope, "customer_shared");
    assert.equal(created.ownerApplicationId, undefined);
    assert.match(created.storageObjectReference, /^pending-upload:/);
    assert.equal(created.correlationId, "asset-create-correlation-001");
    assert.equal("tenantId" in body.asset, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
