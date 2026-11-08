import test from "node:test";
import assert from "node:assert/strict";
import { startCustomerAssetUpload } from "../dist/packages/assets/customer-asset-upload-service.js";

const input = {
  tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a",
  environment: "sandbox", correlationId: "asset-recovery-test-001",
  assetId: "asset-001", expectedSizeBytes: 2048, expectedChecksumSha256: "a".repeat(64),
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
    disposition: "created",
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
      recordUploadProviderRejection: async () => assert.fail("unexpected provider rejection"),
    },
    providerCapabilities: { idempotentCreateByUploadSessionId: true, lookupByUploadSessionId: true, renewByProviderReference: true },
    issueGrant: async (request, correlationId) => {
      events.push("provider");
      assert.equal(request.uploadSessionId, "00000000-0000-4000-8000-000000000001");
      assert.equal(request.assetId, input.assetId);
      assert.equal(correlationId, input.correlationId);
      assert.notEqual(correlationId, input.idempotencyKey, "request correlation must not reuse the client idempotency key");
      return { kind: "succeeded", ...grant() };
    },
  });
  assert.deepEqual(events, ["reserve", "provider", "persist-grant"]);
  assert.match(reservedInput.requestFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(recorded.providerUploadReference, "provider-object-001");
  assert.equal(result.uploadSessionId, reservation().uploadSessionId);
  assert.equal("providerUploadReference" in result, false);
});

test("replayed reservation without provider reference fails closed without invoking provider", async () => {
  const prior = reservation({ disposition: "replayed" });
  let providerCalls = 0;
  const result = await startCustomerAssetUpload(input, {
    now: () => now,
    repository: {
      reserveUpload: async () => prior,
      recordUploadGrant: async () => assert.fail("must not persist"), recordUploadProviderRejection: async () => assert.fail("must not reject"),
    },
    issueGrant: async () => { providerCalls++; return { kind: "succeeded", ...grant() }; },
  });
  assert.equal(result, null);
  assert.equal(providerCalls, 0);
});

test("matching retry reuses the same session and requires the same provider object", async () => {
  let requestSeen;
  let saved;
  const prior = reservation({ disposition: "replayed", providerUploadReference: "provider-object-existing" });
  const result = await startCustomerAssetUpload(input, {
    now: () => now,
    repository: {
      reserveUpload: async () => prior,
      recordUploadGrant: async (value) => { saved = value; },
      recordUploadProviderRejection: async () => assert.fail("unexpected provider rejection"),
    },
    providerCapabilities: { idempotentCreateByUploadSessionId: true, lookupByUploadSessionId: true, renewByProviderReference: true },
    issueGrant: async (request) => { requestSeen = request; return { kind: "succeeded", ...grant("provider-object-existing") }; },
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
    repository: { reserveUpload: async () => prior, recordUploadGrant: async () => assert.fail("must not persist"), recordUploadProviderRejection: async () => assert.fail("must not reject") },
    providerCapabilities: { idempotentCreateByUploadSessionId: true, lookupByUploadSessionId: true, renewByProviderReference: true },
    issueGrant: async () => ({ kind: "succeeded", ...grant("different-provider-object") }),
  }), /PROVIDER_REFERENCE_CONFLICT/);
});

test("same idempotency key with changed immutable metadata is rejected by repository", async () => {
  const changed = { ...input, fileName: "renamed.xlsx" };
  let fingerprint;
  await startCustomerAssetUpload(input, {
    now: () => now,
    repository: {
      reserveUpload: async (value) => { fingerprint = value.requestFingerprint; return reservation(); },
      recordUploadGrant: async () => {}, recordUploadProviderRejection: async () => {},
    },
    providerCapabilities: { idempotentCreateByUploadSessionId: true, lookupByUploadSessionId: true, renewByProviderReference: true },
    issueGrant: async () => ({ kind: "succeeded", ...grant() }),
  });
  await assert.rejects(() => startCustomerAssetUpload(changed, {
    now: () => now,
    repository: {
      reserveUpload: async (value) => {
        assert.notEqual(value.requestFingerprint, fingerprint);
        throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_IDEMPOTENCY_CONFLICT");
      },
      recordUploadGrant: async () => assert.fail("must not persist"),
      recordUploadProviderRejection: async () => assert.fail("must not reject"),
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
        recordUploadProviderRejection: async () => assert.fail("must not reject"),
      },
      issueGrant: async () => assert.fail("must not issue a grant"),
    }), new RegExp(state.toUpperCase()));
  }
});

test("ambiguous first provider outcome is not blindly created again on reservation replay", async () => {
  let reservations = 0;
  let providerCalls = 0;
  const deps = {
    now: () => now,
    repository: {
      reserveUpload: async () => {
        reservations++;
        return reservation(reservations > 1 ? { disposition: "replayed" } : {});
      },
      recordUploadGrant: async () => {},
      recordUploadProviderRejection: async () => {},
    },
    providerCapabilities: { idempotentCreateByUploadSessionId: true, lookupByUploadSessionId: true, renewByProviderReference: true },
    issueGrant: async () => { providerCalls++; return { kind: "unknown", reason: "transport" }; },
  };
  assert.equal(await startCustomerAssetUpload(input, deps), null);
  assert.equal(await startCustomerAssetUpload(input, deps), null);
  assert.equal(reservations, 2);
  assert.equal(providerCalls, 1, "a replay without a saved provider reference must not create again");
});

test("only a definitive typed provider rejection is persisted as terminal rejection", async () => {
  let rejected;
  const result = await startCustomerAssetUpload(input, {
    now: () => now,
    repository: {
      reserveUpload: async () => reservation(),
      recordUploadGrant: async () => assert.fail("must not persist a grant"),
      recordUploadProviderRejection: async value => { rejected = value; },
    },
    providerCapabilities: { idempotentCreateByUploadSessionId: true, lookupByUploadSessionId: true, renewByProviderReference: true },
    issueGrant: async () => ({ kind: "rejected", rejectionCode: "policy_denied" }),
  });
  assert.equal(result, null);
  assert.equal(rejected.uploadSessionId, reservation().uploadSessionId);
  assert.equal(rejected.rejectionCode, "policy_denied");
});


test("replayed reservation recovers the existing provider object by the same durable session ID", async () => {
  const prior = reservation({ disposition: "replayed" });
  let lookupSeen;
  let issueSeen;
  let persisted;
  const result = await startCustomerAssetUpload(input, {
    now: () => now,
    providerCapabilities: { idempotentCreateByUploadSessionId: true, lookupByUploadSessionId: true, renewByProviderReference: true },
    lookupUpload: async (sessionId, correlationId, scope) => {
      lookupSeen = { sessionId, correlationId, scope };
      return { kind: "found", providerUploadReference: "provider-object-recovered" };
    },
    repository: {
      reserveUpload: async () => prior,
      recordUploadGrant: async value => { persisted = value; },
      recordUploadProviderRejection: async () => assert.fail("must not reject recovered object"),
    },
    issueGrant: async request => {
      issueSeen = request;
      return { kind: "succeeded", ...grant("provider-object-recovered") };
    },
  });
  assert.deepEqual(lookupSeen, { sessionId: prior.uploadSessionId, correlationId: input.correlationId, scope: { tenantId: input.tenantId, applicationId: input.applicationId } });
  assert.equal(issueSeen.uploadSessionId, prior.uploadSessionId);
  assert.equal(issueSeen.providerUploadReference, "provider-object-recovered");
  assert.equal(persisted.providerUploadReference, "provider-object-recovered");
  assert.equal(result.uploadSessionId, prior.uploadSessionId);
});

test("authoritative not-found permits same-session create only with declared idempotency", async () => {
  const prior = reservation({ disposition: "replayed" });
  let issued = 0;
  const result = await startCustomerAssetUpload(input, {
    now: () => now,
    providerCapabilities: { idempotentCreateByUploadSessionId: true, lookupByUploadSessionId: true, renewByProviderReference: true },
    lookupUpload: async sessionId => { assert.equal(sessionId, prior.uploadSessionId); return { kind: "not_found" }; },
    repository: {
      reserveUpload: async () => prior, recordUploadGrant: async () => {},
      recordUploadProviderRejection: async () => assert.fail("unexpected rejection"),
    },
    issueGrant: async request => {
      issued++;
      assert.equal(request.uploadSessionId, prior.uploadSessionId);
      assert.equal("providerUploadReference" in request, false);
      return { kind: "succeeded", ...grant("provider-object-created-same-session") };
    },
  });
  assert.equal(issued, 1);
  assert.equal(result.uploadSessionId, prior.uploadSessionId);
});

test("not-found without idempotent-create guarantee and unavailable lookup remain pending", async () => {
  const prior = reservation({ disposition: "replayed" });
  for (const [lookup, capabilities] of [
    [{ kind: "not_found" }, { idempotentCreateByUploadSessionId: false, lookupByUploadSessionId: true, renewByProviderReference: true }],
    [{ kind: "unavailable" }, { idempotentCreateByUploadSessionId: true, lookupByUploadSessionId: true, renewByProviderReference: true }],
    [{ kind: "unknown" }, { idempotentCreateByUploadSessionId: true, lookupByUploadSessionId: true, renewByProviderReference: true }],
  ]) {
    let issued = 0;
    const result = await startCustomerAssetUpload(input, {
      now: () => now, providerCapabilities: capabilities,
      lookupUpload: async () => lookup,
      repository: { reserveUpload: async () => prior, recordUploadGrant: async () => assert.fail("must not persist"), recordUploadProviderRejection: async () => assert.fail("must not reject") },
      issueGrant: async () => { issued++; return { kind: "succeeded", ...grant() }; },
    });
    assert.equal(result, null);
    assert.equal(issued, 0);
  }
});


test("new reservation fails closed unless provider guarantees idempotent create", async () => {
  let issued = 0;
  const result = await startCustomerAssetUpload(input, {
    now: () => now,
    providerCapabilities: { idempotentCreateByUploadSessionId: false, lookupByUploadSessionId: true, renewByProviderReference: true },
    repository: { reserveUpload: async () => reservation(), recordUploadGrant: async () => assert.fail("must not persist"), recordUploadProviderRejection: async () => assert.fail("must not reject") },
    issueGrant: async () => { issued++; return { kind: "succeeded", ...grant() }; },
  });
  assert.equal(result, null);
  assert.equal(issued, 0);
});

test("replayed found object requires exact-reference renewal capability", async () => {
  const prior = reservation({ disposition: "replayed" });
  let issued = 0;
  const result = await startCustomerAssetUpload(input, {
    now: () => now,
    providerCapabilities: { idempotentCreateByUploadSessionId: false, lookupByUploadSessionId: true, renewByProviderReference: false },
    lookupUpload: async () => ({ kind: "found", providerUploadReference: "provider-object-existing" }),
    repository: { reserveUpload: async () => prior, recordUploadGrant: async () => assert.fail("must not persist"), recordUploadProviderRejection: async () => assert.fail("must not reject") },
    issueGrant: async () => { issued++; return { kind: "succeeded", ...grant("provider-object-existing") }; },
  });
  assert.equal(result, null);
  assert.equal(issued, 0);
});


test("upload initiation rejects malformed expected SHA-256 before reserving or invoking a provider", async () => {
  let reservations = 0;
  await assert.rejects(() => startCustomerAssetUpload({ ...input, expectedChecksumSha256: "not-a-sha256" }, {
    repository: { reserveUpload: async () => { reservations++; return reservation(); },
      recordUploadGrant: async () => assert.fail("must not persist"),
      recordUploadProviderRejection: async () => assert.fail("must not reject") },
    issueGrant: async () => assert.fail("provider must not be called"),
  }), /EXPECTED_CHECKSUM_INVALID/);
  assert.equal(reservations, 0);
});

test("same idempotency key with a different expected SHA-256 changes the immutable request fingerprint", async () => {
  let originalFingerprint;
  const deps = {
    now: () => now,
    repository: { reserveUpload: async value => { originalFingerprint ??= value.requestFingerprint; return reservation(); },
      recordUploadGrant: async () => {}, recordUploadProviderRejection: async () => {} },
    providerCapabilities: { idempotentCreateByUploadSessionId: true, lookupByUploadSessionId: true, renewByProviderReference: true },
    issueGrant: async () => ({ kind: "succeeded", ...grant() }),
  };
  await startCustomerAssetUpload(input, deps);
  const changed = { ...input, expectedChecksumSha256: "b".repeat(64) };
  await startCustomerAssetUpload(changed, { ...deps, repository: {
    ...deps.repository,
    reserveUpload: async value => {
      assert.notEqual(value.requestFingerprint, originalFingerprint);
      throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_IDEMPOTENCY_CONFLICT");
    },
  } });
});
