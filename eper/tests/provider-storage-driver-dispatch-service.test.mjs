import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ProviderStorageDispatchError,
  ProviderStorageDriverDispatchService,
} from "../dist/packages/integrations/provider-storage-driver-dispatch-service.js";

const capabilities = {
  idempotentCreateByUploadSessionId: true, lookupByUploadSessionId: true,
  renewByProviderReference: true, verifyObject: true, downloadGrant: true, malwareScan: true,
};
function fixture({ selection = {}, driver = {}, resolveError = null, dependencyInventory = undefined } = {}) {
  const calls = [];
  const adapter = {
    dependencyIds: [],
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
  }, dependencyInventory);
  const dispatch = service.dispatch.bind(service);
  service.dispatch = input => dispatch({ actorId: "actor-a", correlationId: "correlation-a", ...input });
  return { service, calls, credentials };
}

test("resolves tenant-scoped runtime and invokes only the requested operation", async () => {
  const f = fixture();
  const result = await f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-1",
    operation: { kind: "lookup_upload", request: { tenantId: "tenant-a", applicationId: "app-a", uploadSessionId: "upload-session-1" } },
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
    operation: { kind: "lookup_upload", request: { tenantId: "tenant-a", applicationId: "app-a", uploadSessionId: "session" } },
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
    operation: { kind: "lookup_upload", request: { tenantId: "tenant-a", applicationId: "app-a", uploadSessionId: "session" } },
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

// Network-free synthetic driver contract: every operation returns a conservative
// fixture outcome; no SDK, credentials, HTTP client or provider endpoint is used.
test("routes all six storage operations through their exact capability and synthetic driver method", async () => {
  const cases = [
    {
      kind: "create_upload",
      capability: "storage.upload.grant",
      request: { tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a", assetId: "asset-a",
        uploadSessionId: "session-a", fileName: "evidence.txt", mimeType: "text/plain", sizeBytes: 12 },
      expectedCall: "create",
      expectedResult: { kind: "unknown", reason: "transport" },
    },
    {
      kind: "lookup_upload",
      capability: "storage.upload.lookup",
      request: { tenantId: "tenant-a", applicationId: "app-a", uploadSessionId: "session-a" },
      expectedCall: "lookup",
      expectedResult: { kind: "not_found" },
    },
    {
      kind: "renew_upload",
      capability: "storage.upload.renew",
      request: { tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a", assetId: "asset-a",
        uploadSessionId: "session-a", fileName: "evidence.txt", mimeType: "text/plain",
        sizeBytes: 12, providerUploadReference: "synthetic-object-ref" },
      expectedCall: "renew",
      expectedResult: { kind: "unknown", reason: "transport" },
    },
    {
      kind: "verify_object",
      capability: "storage.object.verify",
      request: { uploadSessionId: "session-a", providerUploadReference: "synthetic-object-ref",
        expectedSizeBytes: 12, expectedMimeType: "text/plain", expectedSha256: "a".repeat(64) },
      expectedCall: "verify",
      expectedResult: { kind: "unknown" },
    },
    {
      kind: "create_download",
      capability: "storage.download.grant",
      request: { tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a",
        assetId: "asset-a", accessReference: "synthetic-access-ref", fileName: "evidence.txt" },
      expectedCall: "download",
      expectedResult: null,
    },
    {
      kind: "scan_object",
      capability: "storage.object.scan",
      request: { assetId: "asset-a", providerObjectReference: "synthetic-object-ref",
        expectedSha256: "a".repeat(64) },
      expectedCall: "scan",
      expectedResult: { kind: "timeout" },
    },
  ];

  for (const item of cases) {
    const f = fixture();
    const result = await f.service.dispatch({
      tenantId: "tenant-a",
      applicationId: "app-a",
      requestId: `req-${item.kind}`,
      operation: { kind: item.kind, request: item.request },
    });
    assert.deepEqual(result, item.expectedResult, item.kind);
    assert.equal(f.calls[0][0], "resolve", item.kind);
    assert.equal(f.calls[0][1].capability, item.capability, item.kind);
    assert.equal(f.calls.filter(call => call[0] !== "resolve").length, 1, item.kind);
    assert.equal(f.calls[1][0], item.expectedCall, item.kind);
    assert.equal(f.calls[1][1].credentials, f.credentials, item.kind);
    assert.equal(JSON.stringify(result).includes("must-not-escape"), false, item.kind);
  }
});


test("forwards AbortSignal through tenant-scoped scan dispatch to the provider driver", async () => {
  const controller = new AbortController();
  let receivedSignal;
  const f = fixture({ driver: { async scanObject(_context, _request, _requestId, signal) {
    receivedSignal = signal;
    return { kind: "timeout" };
  } } });
  await f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-cancel",
    operation: { kind: "scan_object", request: {
      assetId: "asset-a", providerObjectReference: "object-ref", expectedSha256: "a".repeat(64),
    } }, signal: controller.signal,
  });
  assert.equal(receivedSignal, controller.signal);
  controller.abort();
  assert.equal(receivedSignal.aborted, true);
});

test("rejects an already-aborted provider operation before resolving credentials", async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-aborted",
    operation: { kind: "scan_object", request: {
      assetId: "asset-a", providerObjectReference: "object-ref", expectedSha256: "a".repeat(64),
    } }, signal: controller.signal,
  }), error => error instanceof ProviderStorageDispatchError &&
    error.code === "PROVIDER_STORAGE_DISPATCH_ABORTED");
  assert.equal(f.calls.some(call => call[0] === "resolve"), false);
});


test("does not invoke the provider when cancellation occurs during credential resolution", async () => {
  let releaseResolution;
  let driverInvoked = false;
  const resolution = new Promise(resolve => { releaseResolution = resolve; });
  const adapter = {
    dependencyIds: [],
    capabilities,
    async createUploadGrant() { driverInvoked = true; return { kind: "unknown", reason: "transport" }; },
    async lookupUpload() { driverInvoked = true; return { kind: "not_found" }; },
    async renewUploadGrant() { driverInvoked = true; return { kind: "unknown", reason: "transport" }; },
    async verifyObject() { driverInvoked = true; return { kind: "unknown" }; },
    async createDownloadGrant() { driverInvoked = true; return null; },
    async scanObject() { driverInvoked = true; return { kind: "timeout" }; },
  };
  const service = new ProviderStorageDriverDispatchService({
    async resolve(input) {
      await resolution;
      return {
        runtime: {
          selection: { tenantId: input.tenantId, applicationId: input.applicationId,
            capabilityKey: input.capability, connectionId: "connection-a", providerKey: "provider-a" },
          capability: input.capability, adapter,
        },
        credentials: { token: "test-only" },
      };
    },
  }, { async getDependencyInventory() { return []; } });
  const dispatch = service.dispatch.bind(service);
  service.dispatch = input => dispatch({ actorId: "actor-a", correlationId: "correlation-a", ...input });
  const controller = new AbortController();
  const pending = service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-during-resolution",
    operation: { kind: "scan_object", request: {
      assetId: "asset-a", providerObjectReference: "object-ref", expectedSha256: "a".repeat(64),
    } }, signal: controller.signal,
  });
  controller.abort();
  releaseResolution();
  await assert.rejects(pending, error => error instanceof ProviderStorageDispatchError &&
    error.code === "PROVIDER_STORAGE_DISPATCH_ABORTED");
  assert.equal(driverInvoked, false);
});


test("internal object read uses its own optional capability and exact connection binding", async () => {
  const chunks = [new Uint8Array([1, 2]), new Uint8Array([3])];
  let received;
  const f = fixture({
    driver: {
      capabilities: { ...capabilities, internalObjectRead: true },
      async readObjectInternal(context, request, requestId, signal) {
        received = { context, request, requestId, signal };
        return (async function* () { for (const chunk of chunks) yield chunk; })();
      },
    },
  });
  const result = await f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-internal-read",
    expectedConnectionId: "connection-a",
    operation: { kind: "read_object_internal", request: {
      assetId: "asset-a", providerObjectReference: "opaque-ref",
      expectedSizeBytes: 3, expectedSha256: createHash("sha256").update(new Uint8Array([1, 2, 3])).digest("hex"),
    } },
  });
  assert.equal(f.calls[0][1].capability, "storage.object.read.internal");
  assert.equal(f.calls[0][1].expectedConnectionId, "connection-a");
  assert.equal(received.context.connectionId, "connection-a");
  assert.equal(received.request.providerObjectReference, "opaque-ref");
  assert.equal(received.requestId, "req-internal-read");
  assert.equal(result[Symbol.asyncIterator] instanceof Function, true);
  const read = [];
  for await (const chunk of result) read.push(...chunk);
  assert.deepEqual(read, [1, 2, 3]);
});

test("internal object read fails closed when the adapter has not explicitly opted in", async () => {
  const f = fixture();
  await assert.rejects(() => f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-no-read",
    expectedConnectionId: "connection-a",
    operation: { kind: "read_object_internal", request: {
      assetId: "asset-a", providerObjectReference: "opaque-ref",
      expectedSizeBytes: 3, expectedSha256: "a".repeat(64),
    } },
  }), error => error instanceof ProviderStorageDispatchError &&
    error.code === "PROVIDER_STORAGE_DISPATCH_CAPABILITY_MISSING");
  assert.equal(f.calls[0][1].capability, "storage.object.read.internal");
});

test("internal object read rejects invalid size or checksum before credential resolution", async () => {
  const f = fixture();
  await assert.rejects(() => f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-invalid-read",
    operation: { kind: "read_object_internal", request: {
      assetId: "asset-a", providerObjectReference: "opaque-ref",
      expectedSizeBytes: 0, expectedSha256: "not-a-checksum",
    } },
  }), error => error instanceof ProviderStorageDispatchError &&
    error.code === "PROVIDER_STORAGE_DISPATCH_REQUEST_INVALID");
  assert.equal(f.calls.length, 0);
});

test("internal object read rejects a runtime that violates the authenticated connection pin", async () => {
  let driverInvoked = false;
  const f = fixture({
    selection: { connectionId: "connection-other" },
    driver: {
      capabilities: { ...capabilities, internalObjectRead: true },
      async readObjectInternal() {
        driverInvoked = true;
        return (async function* () { yield new Uint8Array([1]); })();
      },
    },
  });
  await assert.rejects(() => f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-wrong-connection",
    expectedConnectionId: "connection-a",
    operation: { kind: "read_object_internal", request: {
      assetId: "asset-a", providerObjectReference: "opaque-ref",
      expectedSizeBytes: 1, expectedSha256: createHash("sha256").update(new Uint8Array([1])).digest("hex"),
    } },
  }), error => error instanceof ProviderStorageDispatchError &&
    error.code === "PROVIDER_STORAGE_DISPATCH_SCOPE_MISMATCH");
  assert.equal(driverInvoked, false, "a driver must not run on a connection other than the authenticated pin");
});

test("internal object read requires an explicit authenticated provider connection pin", async () => {
  const f = fixture();
  await assert.rejects(() => f.service.dispatch({
    tenantId: "tenant-a", applicationId: "app-a", requestId: "req-unpinned-read",
    operation: { kind: "read_object_internal", request: {
      assetId: "asset-a", providerObjectReference: "opaque-ref",
      expectedSizeBytes: 1, expectedSha256: createHash("sha256").update(new Uint8Array([1])).digest("hex"),
    } },
  }), error => error instanceof ProviderStorageDispatchError &&
    error.code === "PROVIDER_STORAGE_DISPATCH_REQUEST_INVALID");
  assert.equal(f.calls.length, 0, "un-pinned reads must fail before runtime or credential resolution");
});

