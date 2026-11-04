import test from "node:test";
import assert from "node:assert/strict";
import { startCustomerAssetUpload } from "../dist/packages/assets/customer-asset-upload-service.js";

const input = {
  tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a",
  environment: "sandbox", correlationId: "request-correlation-0001",
  assetId: "asset-0001", expectedSizeBytes: 2048,
  idempotencyKey: "asset-upload-idempotency-001",
  fileName: "plan.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

test("upload start persists provider reference before returning capability", async () => {
  const order = [];
  let stored;
  const result = await startCustomerAssetUpload(input, {
    now: () => 1_700_000_000_000,
    issueGrant: async (request, requestId) => {
      order.push("provider");
      assert.equal(request.assetId, input.assetId);
      assert.equal(request.sizeBytes, input.expectedSizeBytes);
      assert.equal(requestId, input.correlationId);
      return {
        providerUploadReference: "opaque-provider-object-001",
        url: "https://storage.example.test/upload?signature=secret",
        method: "PUT",
        expiresAt: new Date(1_700_000_060_000).toISOString(),
        headers: { "content-type": input.mimeType },
      };
    },
    repository: {
      reserveUpload: async (reservation) => {
        order.push("database");
        stored = reservation;
        assert.equal(reservation.providerUploadReference, "opaque-provider-object-001");
        assert.equal(reservation.uploadSessionId.length, 36);
      },
    },
  });
  assert.deepEqual(order, ["provider", "database"]);
  assert.equal(result.method, "PUT");
  assert.equal(result.uploadSessionId, stored.uploadSessionId);
  assert.equal(Object.hasOwn(result, "providerUploadReference"), false);
});

test("upload start never returns a capability if durable reservation fails", async () => {
  await assert.rejects(() => startCustomerAssetUpload(input, {
    issueGrant: async () => ({
      providerUploadReference: "opaque-provider-object-002",
      url: "https://storage.example.test/upload", method: "PUT",
      expiresAt: new Date(Date.now() + 30_000).toISOString(), headers: {},
    }),
    repository: { reserveUpload: async () => { throw new Error("audit transaction failed"); } },
  }), /audit transaction failed/);
});

test("upload start fails closed when provider cannot issue a grant", async () => {
  let reserved = false;
  const result = await startCustomerAssetUpload(input, {
    issueGrant: async () => null,
    repository: { reserveUpload: async () => { reserved = true; } },
  });
  assert.equal(result, null);
  assert.equal(reserved, false);
});

test("upload start rejects invalid size, idempotency and excessive expiry", async () => {
  const dependencies = {
    now: () => 1_700_000_000_000,
    issueGrant: async () => ({
      providerUploadReference: "opaque-provider-object-003",
      url: "https://storage.example.test/upload", method: "PUT",
      expiresAt: new Date(1_700_001_000_000).toISOString(), headers: {},
    }),
    repository: { reserveUpload: async () => {} },
  };
  await assert.rejects(() => startCustomerAssetUpload({ ...input, expectedSizeBytes: 0 }, dependencies), /EXPECTED_SIZE_INVALID/);
  await assert.rejects(() => startCustomerAssetUpload({ ...input, idempotencyKey: "short" }, dependencies), /IDEMPOTENCY_KEY_INVALID/);
  assert.equal(await startCustomerAssetUpload(input, dependencies), null);
});
