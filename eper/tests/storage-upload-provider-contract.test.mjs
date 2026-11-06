import test from "node:test";
import assert from "node:assert/strict";
import { issueOrRecoverStorageUploadGrant } from "../dist/packages/assets/storage-upload-provider-contract.js";

const request = {
  tenantId: "tenant-a", actorId: "actor-a", applicationId: "app-a",
  assetId: "asset-a", uploadSessionId: "persisted-session-001",
  fileName: "brief.docx", mimeType: "application/msword", sizeBytes: 128,
};
const grant = {
  url: "https://storage.example.test/upload", method: "PUT",
  expiresAt: new Date(Date.now() + 30_000).toISOString(), headers: {},
};
const capabilities = {
  idempotentCreateByUploadSessionId: true,
  lookupByUploadSessionId: true,
  renewGrantForExistingReference: true,
};

test("fresh reservation invokes create using the persisted upload-session identity", async () => {
  let call;
  const provider = {
    capabilities,
    create: async (input, correlationId) => {
      call = { input, correlationId };
      return { status: "succeeded", providerUploadReference: "provider-object-1", grant };
    },
    lookupByUploadSessionId: async () => { throw new Error("must not lookup when idempotent create is declared"); },
    renewGrantForExistingReference: async () => { throw new Error("must not renew a fresh reservation"); },
  };
  const result = await issueOrRecoverStorageUploadGrant(provider, request, "corr-001");
  assert.equal(call.input.uploadSessionId, request.uploadSessionId);
  assert.equal(call.correlationId, "corr-001");
  assert.equal(result.status, "succeeded");
});

test("outcome-unknown is preserved and never retried with a new provider create", async () => {
  let creates = 0;
  const provider = {
    capabilities,
    create: async () => { creates += 1; return { status: "unknown", code: "provider_outcome_unknown" }; },
    lookupByUploadSessionId: async () => { creates += 100; return { status: "not_found" }; },
    renewGrantForExistingReference: async () => { throw new Error("unexpected renewal"); },
  };
  const result = await issueOrRecoverStorageUploadGrant(provider, request, "corr-002");
  assert.deepEqual(result, { status: "unknown", code: "provider_outcome_unknown" });
  assert.equal(creates, 1);
});

test("provider without create or lookup capability fails closed without invocation", async () => {
  let calls = 0;
  const provider = {
    capabilities: { ...capabilities, idempotentCreateByUploadSessionId: false, lookupByUploadSessionId: false },
    create: async () => { calls += 1; return { status: "succeeded", providerUploadReference: "wrong", grant }; },
    lookupByUploadSessionId: async () => { calls += 1; return { status: "not_found" }; },
    renewGrantForExistingReference: async () => { calls += 1; return { status: "unknown", code: "provider_outcome_unknown" }; },
  };
  const result = await issueOrRecoverStorageUploadGrant(provider, request, "corr-003");
  assert.deepEqual(result, { status: "unavailable", code: "provider_recovery_unsupported" });
  assert.equal(calls, 0);
});

test("lookup-only provider recovers an existing object but does not create after a lookup miss", async () => {
  let creates = 0;
  const provider = {
    capabilities: { ...capabilities, idempotentCreateByUploadSessionId: false },
    create: async () => { creates += 1; return { status: "unknown", code: "provider_outcome_unknown" }; },
    lookupByUploadSessionId: async () => ({ status: "succeeded", providerUploadReference: "recovered-object", grant }),
    renewGrantForExistingReference: async () => ({ status: "unknown", code: "provider_outcome_unknown" }),
  };
  const recovered = await issueOrRecoverStorageUploadGrant(provider, request, "corr-004");
  assert.equal(recovered.status, "succeeded");
  assert.equal(recovered.providerUploadReference, "recovered-object");

  provider.lookupByUploadSessionId = async () => ({ status: "not_found" });
  const missing = await issueOrRecoverStorageUploadGrant(provider, request, "corr-005");
  assert.deepEqual(missing, { status: "unavailable", code: "provider_recovery_unsupported" });
  assert.equal(creates, 0);
});

test("existing reservation renews only its exact persisted provider reference", async () => {
  let received;
  const provider = {
    capabilities,
    create: async () => { throw new Error("existing session must not create"); },
    lookupByUploadSessionId: async () => { throw new Error("existing session must not lookup/create"); },
    renewGrantForExistingReference: async (input) => {
      received = input;
      return { status: "succeeded", providerUploadReference: input.providerUploadReference, grant };
    },
  };
  const existing = { uploadSessionId: request.uploadSessionId, providerUploadReference: "persisted-provider-ref" };
  const result = await issueOrRecoverStorageUploadGrant(provider, request, "corr-006", existing);
  assert.deepEqual(received, existing);
  assert.equal(result.status, "succeeded");
});

test("existing-session renewal cannot switch provider object references", async () => {
  const provider = {
    capabilities,
    create: async () => { throw new Error("unexpected create"); },
    lookupByUploadSessionId: async () => { throw new Error("unexpected lookup"); },
    renewGrantForExistingReference: async () => ({
      status: "succeeded", providerUploadReference: "different-provider-object", grant,
    }),
  };
  const result = await issueOrRecoverStorageUploadGrant(
    provider, request, "corr-007",
    { uploadSessionId: request.uploadSessionId, providerUploadReference: "persisted-provider-ref" },
  );
  assert.deepEqual(result, { status: "unknown", code: "provider_outcome_unknown" });
});

test("existing session identity mismatch is rejected before provider invocation", async () => {
  let calls = 0;
  const provider = {
    capabilities,
    create: async () => { calls += 1; return { status: "unknown", code: "provider_outcome_unknown" }; },
    lookupByUploadSessionId: async () => { calls += 1; return { status: "not_found" }; },
    renewGrantForExistingReference: async () => { calls += 1; return { status: "unknown", code: "provider_outcome_unknown" }; },
  };
  await assert.rejects(
    () => issueOrRecoverStorageUploadGrant(provider, request, "corr-008", {
      uploadSessionId: "another-session", providerUploadReference: "persisted-provider-ref",
    }),
    /EXISTING_SESSION_IDENTITY_MISMATCH/,
  );
  assert.equal(calls, 0);
});
