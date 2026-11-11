import assert from "node:assert/strict";
import test from "node:test";
import { SyntheticProviderStorageDriver } from "../dist/packages/integrations/synthetic-provider-storage-driver.js";
import { SyntheticProviderStorageSecretResolver } from "../dist/packages/integrations/synthetic-provider-storage-secret-resolver.js";
import { ProviderStorageDriverDispatchService } from "../dist/packages/integrations/provider-storage-driver-dispatch-service.js";

test("dedicated synthetic driver traverses all six tenant-scoped dispatch operations without network access", async () => {
  const driver = new SyntheticProviderStorageDriver({
    now: () => Date.parse("2026-11-09T08:00:00Z"),
    verificationOutcome: { kind: "verified", sizeBytes: 12, mimeType: "text/plain", sha256: "a".repeat(64) },
    scanOutcome: { kind: "clean", scanReference: "synthetic-scan-fixture" },
  });
  const resolver = new SyntheticProviderStorageSecretResolver();
  const credentials = await resolver.resolve({
    secretReference: "synthetic://tenant-a/connection-a",
    context: { tenantId: "tenant-a", applicationId: "app-a", connectionId: "conn-a",
      providerKey: "synthetic-storage", authMode: "synthetic" },
  });
  const capabilities = {
    idempotentCreateByUploadSessionId: true, lookupByUploadSessionId: true,
    renewByProviderReference: true, verifyObject: true, downloadGrant: true, malwareScan: true,
  };
  const service = new ProviderStorageDriverDispatchService({
    async resolve(input) {
      return { runtime: { selection: { tenantId: input.tenantId, applicationId: input.applicationId,
        capabilityKey: input.capability, connectionId: "conn-a", providerKey: "synthetic-storage" },
        capability: input.capability, adapter: driver }, credentials };
    },
  });
  const scope = { tenantId: "tenant-a", applicationId: "app-a" };
  const dispatch = (kind, request) => service.dispatch({ ...scope, requestId: "req-" + kind,
    operation: { kind, request } });
  const upload = { ...scope, actorId: "actor-a", assetId: "asset-a", uploadSessionId: "session-a",
    fileName: "proof.txt", mimeType: "text/plain", sizeBytes: 12 };
  const created = await dispatch("create_upload", upload);
  assert.equal(created.kind, "succeeded");
  assert.match(created.url, /^https:\/\/uploads\.synthetic\.invalid\//);
  assert.deepEqual(await dispatch("lookup_upload", { ...scope, uploadSessionId: "session-a" }),
    { kind: "found", providerUploadReference: created.providerUploadReference });
  const renewed = await dispatch("renew_upload", { ...upload, providerUploadReference: created.providerUploadReference });
  assert.equal(renewed.kind, "succeeded");
  assert.equal(renewed.providerUploadReference, created.providerUploadReference);
  assert.deepEqual(await dispatch("verify_object", { uploadSessionId: "session-a",
    providerUploadReference: created.providerUploadReference, expectedSizeBytes: 12,
    expectedMimeType: "text/plain", expectedSha256: "a".repeat(64) }),
    { kind: "verified", sizeBytes: 12, mimeType: "text/plain", sha256: "a".repeat(64) });
  const download = await dispatch("create_download", { ...scope, actorId: "actor-a",
    assetId: "asset-a", accessReference: created.providerUploadReference, fileName: "proof.txt" });
  assert.match(download.url, /^https:\/\/downloads\.synthetic\.invalid\//);
  assert.deepEqual(await dispatch("scan_object", { assetId: "asset-a",
    providerObjectReference: created.providerUploadReference, expectedSha256: "a".repeat(64) }),
    { kind: "clean", scanReference: "synthetic-scan-fixture" });
});
