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
  const sessionId = "upload-session-00000001";
  const result = await startCustomerAssetUpload(input, {
    now: () => 1_700_000_000_000,
    issueGrant: async (request, requestId) => {
      order.push("provider");
      assert.equal(request.assetId, input.assetId);
      assert.equal(request.sizeBytes, input.expectedSizeBytes);
      assert.equal(requestId, sessionId);
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
        order.push("reserve");
        stored = reservation;
        assert.match(reservation.requestFingerprint, /^[a-f0-9]{64}$/);
        assert.equal(reservation.requestFileName, input.fileName);
        assert.equal(reservation.requestMimeType, input.mimeType);
        return { disposition: "created", uploadSessionId: sessionId, state: "reserved" };
      },
      finalizeUploadGrant: async (finalization) => {
        order.push("finalize");
        assert.equal(finalization.providerUploadReference, "opaque-provider-object-001");
        assert.equal(finalization.uploadSessionId, sessionId);
      },
      failUploadReservation: async () => { order.push("fail"); },
    },
  });
  assert.deepEqual(order, ["reserve", "provider", "finalize"]);
  assert.equal(result.method, "PUT");
  assert.equal(result.uploadSessionId, sessionId);
  assert.equal(Object.hasOwn(result, "providerUploadReference"), false);
});

test("upload start does not call the provider when durable reservation fails", async () => {
  let providerCalls = 0;
  await assert.rejects(() => startCustomerAssetUpload(input, {
    repository: {
      reserveUpload: async () => { throw new Error("reservation unavailable"); },
      finalizeUploadGrant: async () => {},
      failUploadReservation: async () => {},
    },
    issueGrant: async () => {
      providerCalls += 1;
      return null;
    },
  }), /reservation unavailable/);
  assert.equal(providerCalls, 0, "provider capability issuance must follow a committed reservation");
});

test("upload start never returns a capability if grant finalization fails", async () => {
  await assert.rejects(() => startCustomerAssetUpload(input, {
    issueGrant: async () => ({
      providerUploadReference: "opaque-provider-object-002",
      url: "https://storage.example.test/upload", method: "PUT",
      expiresAt: new Date(Date.now() + 30_000).toISOString(), headers: {},
    }),
    repository: {
      reserveUpload: async () => ({ disposition: "created", uploadSessionId: "upload-session-test-0001", state: "reserved" }),
      finalizeUploadGrant: async () => { throw new Error("audit transaction failed"); },
      failUploadReservation: async () => {},
    },
  }), /audit transaction failed/);
});

test("upload start fails closed when provider cannot issue a grant", async () => {
  let reserved = false;
  const result = await startCustomerAssetUpload(input, {
    issueGrant: async () => null,
    repository: {
      reserveUpload: async () => { reserved = true; return { disposition: "created", uploadSessionId: "upload-session-test-0002", state: "reserved" }; },
      finalizeUploadGrant: async () => {},
      failUploadReservation: async () => {},
    },
  });
  assert.equal(result, null);
  assert.equal(reserved, true);
});

test("upload start rejects invalid size, idempotency and excessive expiry", async () => {
  const dependencies = {
    now: () => 1_700_000_000_000,
    issueGrant: async () => ({
      providerUploadReference: "opaque-provider-object-003",
      url: "https://storage.example.test/upload", method: "PUT",
      expiresAt: new Date(1_700_001_000_000).toISOString(), headers: {},
    }),
    repository: {
      reserveUpload: async () => ({ disposition: "created", uploadSessionId: "upload-session-test-0003", state: "reserved" }),
      finalizeUploadGrant: async () => {},
      failUploadReservation: async () => {},
    },
  };
  await assert.rejects(() => startCustomerAssetUpload({ ...input, expectedSizeBytes: 0 }, dependencies), /EXPECTED_SIZE_INVALID/);
  await assert.rejects(() => startCustomerAssetUpload({ ...input, idempotencyKey: "short" }, dependencies), /IDEMPOTENCY_KEY_INVALID/);
  assert.equal(await startCustomerAssetUpload(input, dependencies), null);
});


test("upload start never returns a fresh grant for an existing idempotency session", async () => {
  await assert.rejects(() => startCustomerAssetUpload(input, {
    issueGrant: async () => ({
      providerUploadReference: "new-provider-reference",
      url: "https://storage.example.test/new-session", method: "PUT",
      expiresAt: new Date(Date.now() + 30_000).toISOString(), headers: {},
    }),
    repository: {
      reserveUpload: async () => ({ disposition: "existing", uploadSessionId: "prior-session-id-00000000", state: "reserved" }),
      finalizeUploadGrant: async () => {},
      failUploadReservation: async () => {},
    },
  }), /UPLOAD_RECOVERY_PENDING/);
});


test("concurrent retries reserve one session and only the winning request mints a grant", async () => {
  let claimed;
  let providerCalls = 0;
  let finalized = 0;
  const repository = {
    reserveUpload: async (reservation) => {
      if (!claimed) { claimed = "upload-session-concurrent-0001"; return { disposition: "created", uploadSessionId: claimed, state: "reserved" }; }
      return { disposition: "existing", uploadSessionId: claimed, state: "reserved" };
    },
    finalizeUploadGrant: async () => { finalized += 1; },
    failUploadReservation: async () => {},
  };
  const dependencies = {
    repository,
    issueGrant: async () => {
      providerCalls += 1;
      return {
        providerUploadReference: "one-provider-reference",
        url: "https://storage.example.test/one", method: "PUT",
        expiresAt: new Date(Date.now() + 30_000).toISOString(), headers: {},
      };
    },
  };
  const results = await Promise.allSettled([
    startCustomerAssetUpload(input, dependencies),
    startCustomerAssetUpload(input, dependencies),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(providerCalls, 1);
  assert.equal(finalized, 1);
});

test("provider null outcome preserves the reservation for recovery", async () => {
  let failedCalls = 0;
  const result = await startCustomerAssetUpload(input, {
    repository: {
      reserveUpload: async () => ({ disposition: "created", uploadSessionId: "upload-session-provider-failure-01", state: "reserved" }),
      finalizeUploadGrant: async () => {},
      failUploadReservation: async () => { failedCalls += 1; },
    },
    issueGrant: async () => null,
  });
  assert.equal(result, null);
  assert.equal(failedCalls, 0, "an ambiguous provider result must not become terminal failure");
});

test("provider timeout preserves reservation because object creation may have succeeded", async () => {
  let failedCalls = 0;
  await assert.rejects(() => startCustomerAssetUpload(input, {
    repository: {
      reserveUpload: async () => ({ disposition: "created", uploadSessionId: "upload-session-provider-timeout-01", state: "reserved" }),
      finalizeUploadGrant: async () => {},
      failUploadReservation: async () => { failedCalls += 1; },
    },
    issueGrant: async () => { throw new Error("simulated response lost after provider create"); },
  }), /simulated response lost/);
  assert.equal(failedCalls, 0, "timeout must remain recoverable, not terminal failed");
});

test("grant persistence failure preserves reservation because provider object may exist", async () => {
  let failedCalls = 0;
  await assert.rejects(() => startCustomerAssetUpload(input, {
    repository: {
      reserveUpload: async () => ({ disposition: "created", uploadSessionId: "upload-session-persist-fail-01", state: "reserved" }),
      finalizeUploadGrant: async () => { throw new Error("database commit outcome uncertain"); },
      failUploadReservation: async () => { failedCalls += 1; },
    },
    issueGrant: async () => ({
      providerUploadReference: "provider-object-may-exist",
      url: "https://storage.example.test/upload", method: "PUT",
      expiresAt: new Date(Date.now() + 30_000).toISOString(), headers: {},
    }),
  }), /database commit outcome uncertain/);
  assert.equal(failedCalls, 0, "database failure must not erase an already-created provider object");
});


test("typed definitive provider rejection is persisted and never returned as a grant", async () => {
  const calls = [];
  const result = await startCustomerAssetUpload(input, {
    issueProviderOutcome: async (request, correlationId) => {
      assert.equal(request.uploadSessionId, "upload-session-rejected-0001");
      assert.equal(correlationId, input.correlationId);
      return { status: "rejected", code: "policy_denied" };
    },
    repository: {
      reserveUpload: async () => ({ disposition: "created", uploadSessionId: "upload-session-rejected-0001", state: "reserved" }),
      finalizeUploadGrant: async () => { calls.push("finalize"); },
      rejectUploadReservation: async (rejection) => {
        calls.push("reject");
        assert.equal(rejection.uploadSessionId, "upload-session-rejected-0001");
        assert.equal(rejection.rejectionCode, "policy_denied");
      },
    },
  });
  assert.equal(result, null);
  assert.deepEqual(calls, ["reject"]);
});

test("typed uncertain provider outcome preserves reservation without terminal rejection", async () => {
  let rejectionCalls = 0;
  const result = await startCustomerAssetUpload(input, {
    issueProviderOutcome: async () => ({ status: "unknown", code: "provider_outcome_unknown" }),
    repository: {
      reserveUpload: async () => ({ disposition: "created", uploadSessionId: "upload-session-unknown-0001", state: "reserved" }),
      finalizeUploadGrant: async () => {},
      rejectUploadReservation: async () => { rejectionCalls += 1; },
    },
  });
  assert.equal(result, null);
  assert.equal(rejectionCalls, 0, "uncertain provider outcomes must remain recoverable");
});

test("typed successful provider outcome finalizes the exact provider reference", async () => {
  let finalized;
  const sessionId = "upload-session-typed-success-01";
  const result = await startCustomerAssetUpload(input, {
    now: () => 1_700_000_000_000,
    issueProviderOutcome: async () => ({
      status: "succeeded",
      providerUploadReference: "opaque-typed-provider-object",
      grant: {
        url: "https://storage.example.test/typed", method: "PUT",
        expiresAt: new Date(1_700_000_060_000).toISOString(), headers: {},
      },
    }),
    repository: {
      reserveUpload: async () => ({ disposition: "created", uploadSessionId: sessionId, state: "reserved" }),
      finalizeUploadGrant: async (value) => { finalized = value; },
    },
  });
  assert.equal(result.uploadSessionId, sessionId);
  assert.equal(finalized.providerUploadReference, "opaque-typed-provider-object");
});
