import assert from "node:assert/strict";
import test from "node:test";
import { SyntheticProviderStorageDriver } from "../dist/packages/integrations/synthetic-provider-storage-driver.js";
import { SyntheticProviderStorageSecretResolver } from "../dist/packages/integrations/synthetic-provider-storage-secret-resolver.js";
import { createProviderStorageRuntimeComposition } from "../dist/packages/integrations/provider-storage-runtime-composition.js";

const capabilities = ["storage.upload.grant", "storage.upload.lookup", "storage.upload.renew",
  "storage.object.verify", "storage.download.grant", "storage.object.scan"];
const context = { tenantId: "tenant-a", applicationId: "app-a", connectionId: "conn-a",
  providerKey: "synthetic-storage", credentials: { synthetic: true, marker: "ephemeral-test-only" } };
const upload = { tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a",
  assetId: "asset-a", uploadSessionId: "session-a", fileName: "proof.txt",
  mimeType: "text/plain", sizeBytes: 12 };

test("synthetic secret resolver accepts only opaque synthetic references and returns no secret", async () => {
  const resolver = new SyntheticProviderStorageSecretResolver();
  const result = await resolver.resolve({ secretReference: "synthetic://tenant-a/connection-a",
    context: { tenantId: "tenant-a", applicationId: "app-a", connectionId: "conn-a",
      providerKey: "synthetic-storage", authMode: "synthetic" } });
  assert.deepEqual(result, { synthetic: true, marker: "ephemeral-test-only" });
  await assert.rejects(() => resolver.resolve({ secretReference: "https://secret.example/token",
    context: { tenantId: "tenant-a", applicationId: "app-a", connectionId: "conn-a",
      providerKey: "synthetic-storage", authMode: "synthetic" } }));
});

test("synthetic driver provides deterministic idempotent create and authoritative lookup", async () => {
  let now = Date.parse("2026-11-09T08:00:00.000Z");
  const driver = new SyntheticProviderStorageDriver({ now: () => now });
  const first = await driver.createUploadGrant(context, upload, "request-1");
  const replay = await driver.createUploadGrant(context, upload, "request-2");
  assert.equal(first.kind, "succeeded");
  assert.equal(replay.kind, "succeeded");
  assert.equal(first.providerUploadReference, replay.providerUploadReference);
  assert.equal(first.url, replay.url);
  assert.deepEqual(await driver.lookupUpload(context, upload.uploadSessionId, "request-3"),
    { kind: "found", providerUploadReference: first.providerUploadReference });
  assert.deepEqual(await driver.lookupUpload(context, "missing-session", "request-4"), { kind: "not_found" });
  now += 1000;
  const renewed = await driver.renewUploadGrant(context,
    { ...upload, providerUploadReference: first.providerUploadReference }, "request-5");
  assert.equal(renewed.kind, "succeeded");
  assert.equal(renewed.providerUploadReference, first.providerUploadReference);
  assert.notEqual(renewed.expiresAt, first.expiresAt);
  assert.match(first.url, /^https:\/\/uploads\.synthetic\.invalid\//);
});

test("synthetic driver rejects cross-tenant lookup, renewal and download access", async () => {
  const driver = new SyntheticProviderStorageDriver();
  const created = await driver.createUploadGrant(context, upload, "request-1");
  assert.equal(created.kind, "succeeded");
  const other = { ...context, tenantId: "tenant-b" };
  assert.deepEqual(await driver.lookupUpload(other, upload.uploadSessionId, "request-2"), { kind: "unknown" });
  assert.equal((await driver.renewUploadGrant(other,
    { ...upload, providerUploadReference: created.providerUploadReference }, "request-3")).kind, "unknown");
  assert.equal(await driver.createDownloadGrant(other, {
    tenantId: "tenant-b", applicationId: "app-a", actorId: "actor-b", assetId: "asset-a",
    accessReference: created.providerUploadReference, fileName: "proof.txt",
  }, "request-4"), null);
  assert.equal(await driver.createDownloadGrant(context, {
    tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a", assetId: "asset-other",
    accessReference: created.providerUploadReference, fileName: "proof.txt",
  }, "request-4b"), null);
  assert.deepEqual(await driver.scanObject(context, { assetId: "asset-other",
    providerObjectReference: created.providerUploadReference, expectedSha256: "a".repeat(64) }, "request-4c"),
    { kind: "malformed" });
});

test("synthetic verification never attests bytes by default and only uses explicit simulated outcomes", async () => {
  const driver = new SyntheticProviderStorageDriver();
  const created = await driver.createUploadGrant(context, upload, "request-1");
  const reference = created.providerUploadReference;
  assert.deepEqual(await driver.verifyObject(context, {
    uploadSessionId: upload.uploadSessionId, providerUploadReference: reference,
    expectedSizeBytes: 12, expectedMimeType: "text/plain", expectedSha256: "a".repeat(64),
  }, "request-2"), { kind: "unknown" });
  assert.deepEqual(await driver.verifyObject(context, {
    uploadSessionId: upload.uploadSessionId, providerUploadReference: reference,
    expectedSizeBytes: 13, expectedMimeType: "text/plain", expectedSha256: "a".repeat(64),
  }, "request-3"), { kind: "mismatch", reason: "size" });
  const simulated = new SyntheticProviderStorageDriver({
    verificationOutcome: { kind: "verified", sizeBytes: 12, mimeType: "text/plain", sha256: "a".repeat(64) },
  });
  await simulated.createUploadGrant(context, upload, "request-4");
  assert.deepEqual(await simulated.verifyObject(context, {
    uploadSessionId: upload.uploadSessionId, providerUploadReference: reference,
    expectedSizeBytes: 12, expectedMimeType: "text/plain", expectedSha256: "a".repeat(64),
  }, "request-5"), { kind: "verified", sizeBytes: 12, mimeType: "text/plain", sha256: "a".repeat(64) });
  assert.deepEqual(await simulated.verifyObject(context, {
    uploadSessionId: upload.uploadSessionId, providerUploadReference: reference,
    expectedSizeBytes: 12, expectedMimeType: "text/plain", expectedSha256: "b".repeat(64),
  }, "request-5b"), { kind: "mismatch", reason: "sha256" });
});

test("synthetic scan defaults to timeout; clean is only an explicit fixture", async () => {
  const driver = new SyntheticProviderStorageDriver();
  const created = await driver.createUploadGrant(context, upload, "request-1");
  assert.deepEqual(await driver.scanObject(context, {
    assetId: upload.assetId, providerObjectReference: created.providerUploadReference,
    expectedSha256: "a".repeat(64),
  }, "request-2"), { kind: "timeout" });
  const simulated = new SyntheticProviderStorageDriver({ scanOutcome: { kind: "clean", scanReference: "synthetic-scan-1" } });
  const second = await simulated.createUploadGrant(context, upload, "request-3");
  assert.deepEqual(await simulated.scanObject(context, {
    assetId: upload.assetId, providerObjectReference: second.providerUploadReference,
    expectedSha256: "a".repeat(64),
  }, "request-4"), { kind: "clean", scanReference: "synthetic-scan-1" });
});

test("synthetic download grant is bounded and uses a reserved invalid hostname", async () => {
  const driver = new SyntheticProviderStorageDriver({ now: () => Date.parse("2026-11-09T08:00:00Z") });
  const created = await driver.createUploadGrant(context, upload, "request-1");
  const result = await driver.createDownloadGrant(context, {
    tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a", assetId: "asset-a",
    accessReference: created.providerUploadReference, fileName: "proof.txt",
  }, "request-2");
  assert.match(result.url, /^https:\/\/downloads\.synthetic\.invalid\//);
  assert.equal(Date.parse(result.expiresAt) - Date.parse("2026-11-09T08:00:00Z"), 300000);
});

test("existing runtime composition accepts the dedicated synthetic driver only outside production", () => {
  const driver = new SyntheticProviderStorageDriver();
  const registration = { adapterKey: "synthetic-storage", adapterVersion: "1.0.0",
    capabilities, adapter: driver, synthetic: true };
  const deploymentPolicy = {
    enabled: true, environment: "test", allowedProviderKeys: ["synthetic-storage"],
    adapters: [{ adapterKey: "synthetic-storage", adapterVersion: "1.0.0",
      capabilities: ["storage.upload.grant", "storage.upload.lookup", "storage.upload.renew",
        "storage.object.verify", "storage.download.grant", "storage.object.scan"], synthetic: true }],
    allowedHosts: ["uploads.synthetic.invalid"], tlsMode: "verify-full",
  };
  const dependencies = {
    enabled: true, environment: "test", deploymentPolicy, registrations: [registration],
    dispatch: { async resolve() { throw new Error("not called"); } },
    catalogue: { async get() { return null; } },
    connections: { async getRuntimeSecretReference() { throw new Error("not called"); },
      async assertDispatchAuthorization() { throw new Error("not called"); } },
    secretResolver: new SyntheticProviderStorageSecretResolver(),
    scannerIdentity: "synthetic-scanner-v1", allowedHosts: ["uploads.synthetic.invalid"],
  };
  assert.equal(createProviderStorageRuntimeComposition(dependencies).enabled, true);
  assert.throws(() => createProviderStorageRuntimeComposition({ ...dependencies, environment: "production",
    deploymentPolicy: { ...deploymentPolicy, environment: "production" } }),
    error => error.code === "PROVIDER_STORAGE_RUNTIME_SYNTHETIC_DRIVER_FORBIDDEN");
});
