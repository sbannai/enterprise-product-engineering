import test from "node:test";
import assert from "node:assert/strict";
import { startCustomerAssetUpload } from "../dist/packages/assets/customer-asset-upload-service.js";

const input = {
  tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a",
  environment: "sandbox", correlationId: "asset-recovery-test-001",
  assetId: "asset-001", expectedSizeBytes: 2048,
  idempotencyKey: "asset-upload-idempotency-001",
  fileName: "plan.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const now = 1_800_000_000_000;
function grant(providerUploadReference = "provider-object-001") {
  return {
    providerUploadReference, url: "https://storage.example.test/upload?short-lived=1",
    method: "PUT", expiresAt: new Date(now + 60_000).toISOString(),
    headers: { "content-type": input.mimeType },
  };
}
function reservation(overrides = {}) {
  return {
    uploadSessionId: "00000000-0000-4000-8000-000000000001",
    providerUploadReference: null, uploadStatus: "initiated",
    expiresAt: new Date(now + 10 * 60_000).toISOString(),
    providerGrantExpiresAt: null, ...overrides,
  };
}

test("reserves a stable session before provider grant and persists grant metadata before disclosure", async () => {
  const events = [];
  let reservedInput;
  let recorded;
  const result = await startCustomerAssetUpload(input, {
    now: () => now,
    repository: {
      reserveUpload: async (value) => { events.push("reserve"); reservedInput = value; return reservation(); },
      recordUploadGrant: async (value) => { events.push("persist-grant"); recorded = value; },
    },
    issueGrant: async (request, idempotencyKey) => {
      events.push("provider");
      assert.equal(request.uploadSessionId, "00000000-0000-4000-8000-000000000001");
      assert.equal(request.assetId, input.assetId);
      assert.equal(idempotencyKey, input.idempotencyKey);
      return grant();
    },
  });
  assert.deepEqual(events, ["reserve", "provider", "persist-grant"]);
  assert.match(reservedInput.requestFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(recorded.providerUploadReference, "provider-object-001");
  assert.equal(result.uploadSessionId, reservation().uploadSessionId);
  assert.equal("providerUploadReference" in result, false);
});

test("matching retry reuses the same session and requires the same provider object", async () => {
  let requestSeen;
  let saved;
  const prior = reservation({ providerUploadReference: "provider-object-existing" });
  const result = await startCustomerAssetUpload(input, {
    now: () => now,
    repository: {
      reserveUpload: async () => prior,
      recordUploadGrant: async (value) => { saved = value; },
    },
    issueGrant: async (request) => { requestSeen = request; return grant("provider-object-existing"); },
  });
  assert.equal(requestSeen.uploadSessionId, prior.uploadSessionId);
  assert.equal(requestSeen.providerUploadReference, "provider-object-existing");
  assert.equal(saved.uploadSessionId, prior.uploadSessionId);
  assert.equal(result.uploadSessionId, prior.uploadSessionId);
});

test("provider renewal cannot switch the persisted provider object", async () => {
  const prior = reservation({ providerUploadReference: "provider-object-existing" });
  await assert.rejects(() => startCustomerAssetUpload(input, {
    now: () => now,
    repository: { reserveUpload: async () => prior, recordUploadGrant: async () => assert.fail("must not persist") },
    issueGrant: async () => grant("different-provider-object"),
  }), /PROVIDER_REFERENCE_CONFLICT/);
});

test("same idempotency key with changed immutable metadata is rejected by repository", async () => {
  const changed = { ...input, fileName: "renamed.xlsx" };
  let fingerprint;
  await startCustomerAssetUpload(input, {
    now: () => now,
    repository: {
      reserveUpload: async (value) => { fingerprint = value.requestFingerprint; return reservation(); },
      recordUploadGrant: async () => {},
    },
    issueGrant: async () => grant(),
  });
  await assert.rejects(() => startCustomerAssetUpload(changed, {
    now: () => now,
    repository: {
      reserveUpload: async (value) => {
        assert.notEqual(value.requestFingerprint, fingerprint);
        throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_IDEMPOTENCY_CONFLICT");
      },
      recordUploadGrant: async () => assert.fail("must not persist"),
    },
    issueGrant: async () => assert.fail("provider must not be called before reservation validation"),
  }), /IDEMPOTENCY_CONFLICT/);
});

test("completed, expired and aborted reservations fail closed without provider calls", async () => {
  for (const state of ["completed", "expired", "aborted"]) {
    await assert.rejects(() => startCustomerAssetUpload(input, {
      now: () => now,
      repository: {
        reserveUpload: async () => reservation({ uploadStatus: state }),
        recordUploadGrant: async () => assert.fail("must not persist"),
      },
      issueGrant: async () => assert.fail("must not issue a grant"),
    }), new RegExp(state.toUpperCase()));
  }
});

test("provider outage leaves the durable reservation available for same-key retry", async () => {
  let calls = 0;
  const deps = {
    now: () => now,
    repository: {
      reserveUpload: async () => { calls++; return reservation(); },
      recordUploadGrant: async () => {},
    },
    issueGrant: async () => null,
  };
  assert.equal(await startCustomerAssetUpload(input, deps), null);
  assert.equal(await startCustomerAssetUpload(input, deps), null);
  assert.equal(calls, 2);
});
