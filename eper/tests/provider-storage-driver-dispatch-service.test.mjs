import assert from "node:assert/strict";
import test from "node:test";
import {
  ProviderStorageDispatchError,
  ProviderStorageDriverDispatchService,
} from "../dist/packages/integrations/provider-storage-driver-dispatch-service.js";

const capabilities = {
  idempotentCreateByUploadSessionId: true, lookupByUploadSessionId: true,
  renewByProviderReference: true, verifyObject: true, downloadGrant: true, malwareScan: true,
};
function fixture({ selection = {}, driver = {}, resolveError = null } = {}) {
  const calls = [];
  const adapter = {
    capabilities,
    async createUploadGrant(context, request, requestId) { calls.push(["create", context, request, requestId]); return { kind: "unknown", reason: "transport" }; },
    async lookupUpload(context, id, requestId) { calls.push(["lookup", context, id, requestId]); return { kind: "not_found" }; },
    async renewUploadGrant(context, request, requestId) { calls.push(["renew", context, request, requestId]); return { kind: "unknown", reason: "transport" }; },
    async verifyObject(context, request, requestId) { calls.push(["verify", context, request, requestId]); return { kind: "unknown" }; },
    async createDownloadGrant(context, request, requestId) { calls.push(["download", context, request, requestId]); return null; },
    async scanObject(context, request, requestId) { calls.push(["scan", context, request, requestId]); return { kind: "timeout" }; },
    ...driver,
  };
  const resolvedSelection = {
    tenantId: "tenant-a", applicationId: "app-a", capabilityKey: selection.capabilityKey ?? "storage.upload.grant",
    connectionId: "connection-a", providerKey: "provider-a", ...selection,
  };
  const credentials = { token: "must-not-escape" };
  const service = new ProviderStorageDriverDispatchService({
    async resolve(input) {
      calls.push(["resolve", input]);
      if (resolveError) throw resolveError;
      return {
        runtime: { selection: { ...resolvedSelection, capabilityKey: selection.capabilityKey ?? input.capability }, capability: input.capability, adapter },
        credentials,
      };
    },
  });
  return { service, calls, credentials };
}

test("resolves tenant-scoped runtime and invokes only the requested operation", async () => {
  const f = fixture();
  const result = await f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-1",
    operation: { kind: "lookup_upload", request: { uploadSessionId: "upload-session-1" } },
  });
  assert.deepEqual(result, { kind: "not_found" });
  assert.equal(f.calls[0][1].capability, "storage.upload.lookup");
  assert.equal(f.calls[1][0], "lookup");
  assert.equal(f.calls[1][1].credentials, f.credentials);
  assert.equal(JSON.stringify(result).includes("must-not-escape"), false);
});

test("rejects a runtime selection that does not match the requested tenant/application", async () => {
  const f = fixture({ selection: { tenantId: "tenant-other" } });
  await assert.rejects(() => f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-1",
    operation: { kind: "lookup_upload", request: { uploadSessionId: "session" } },
  }), error => error instanceof ProviderStorageDispatchError &&
    error.code === "PROVIDER_STORAGE_DISPATCH_SCOPE_MISMATCH");
  assert.equal(f.calls.some(call => call[0] === "lookup"), false);
});

test("rejects cross-tenant upload request before invoking driver", async () => {
  const f = fixture();
  await assert.rejects(() => f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-1",
    operation: { kind: "create_upload", request: {
      tenantId: "tenant-b", applicationId: "app-a", actorId: "actor", assetId: "asset",
      uploadSessionId: "session", fileName: "file.txt", mimeType: "text/plain", sizeBytes: 1,
    } },
  }), error => error instanceof ProviderStorageDispatchError &&
    error.code === "PROVIDER_STORAGE_DISPATCH_SCOPE_MISMATCH");
  assert.equal(f.calls.some(call => call[0] === "create"), false);
});

test("fails closed when a declared operation capability is unavailable", async () => {
  const f = fixture({ driver: { capabilities: { ...capabilities, malwareScan: false }, scanObject: undefined } });
  await assert.rejects(() => f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-1",
    operation: { kind: "scan_object", request: {
      assetId: "asset", providerObjectReference: "object-ref", expectedSha256: "a".repeat(64),
    } },
  }), error => error instanceof ProviderStorageDispatchError &&
    error.code === "PROVIDER_STORAGE_DISPATCH_CAPABILITY_MISSING");
  assert.equal(f.calls.some(call => call[0] === "scan"), false);
});

test("does not invoke a driver when runtime or secret resolution fails", async () => {
  const f = fixture({ resolveError: new Error("binding or secret unavailable") });
  await assert.rejects(() => f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-1",
    operation: { kind: "lookup_upload", request: { uploadSessionId: "session" } },
  }), /binding or secret unavailable/);
  assert.equal(f.calls.some(call => call[0] === "lookup"), false);
});

test("rejects malformed operation inputs before runtime or secret resolution", async () => {
  const f = fixture();
  await assert.rejects(() => f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-1",
    operation: { kind: "lookup_upload", request: { uploadSessionId: " " } },
  }), error => error instanceof ProviderStorageDispatchError &&
    error.code === "PROVIDER_STORAGE_DISPATCH_REQUEST_INVALID");
  await assert.rejects(() => f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-1",
    operation: { kind: "scan_object", request: {
      assetId: "asset", providerObjectReference: "object-ref", expectedSha256: "not-a-hash",
    } },
  }), error => error instanceof ProviderStorageDispatchError &&
    error.code === "PROVIDER_STORAGE_DISPATCH_REQUEST_INVALID");
  assert.equal(f.calls.some(call => call[0] === "resolve"), false);
});

test("classifies renew tenant mismatch as scope failure, not missing capability", async () => {
  const f = fixture();
  await assert.rejects(() => f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-1",
    operation: { kind: "renew_upload", request: {
      tenantId: "tenant-b", applicationId: "app-a", actorId: "actor", assetId: "asset",
      uploadSessionId: "session", fileName: "file.txt", mimeType: "text/plain",
      sizeBytes: 1, providerUploadReference: "provider-ref",
    } },
  }), error => error instanceof ProviderStorageDispatchError &&
    error.code === "PROVIDER_STORAGE_DISPATCH_SCOPE_MISMATCH");
  assert.equal(f.calls.some(call => call[0] === "renew"), false);
});

test("classifies download application mismatch as scope failure, not missing capability", async () => {
  const f = fixture();
  await assert.rejects(() => f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-1",
    operation: { kind: "create_download", request: {
      tenantId: "tenant-a", applicationId: "app-other", actorId: "actor",
      assetId: "asset", accessReference: "access-ref", fileName: "file.txt",
    } },
  }), error => error instanceof ProviderStorageDispatchError &&
    error.code === "PROVIDER_STORAGE_DISPATCH_SCOPE_MISMATCH");
  assert.equal(f.calls.some(call => call[0] === "download"), false);
});
