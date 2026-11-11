import assert from "node:assert/strict";
import test from "node:test";
import { SyntheticProviderStorageDriver } from "../dist/packages/integrations/synthetic-provider-storage-driver.js";
import { assertProviderStorageDriver } from "../dist/packages/integrations/provider-storage-driver-contract.js";

const context = {
  tenantId: "tenant-a", applicationId: "app-a", connectionId: "connection-a",
  providerKey: "synthetic-storage", credentials: { fixtureOnly: true },
};
const upload = {
  tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a",
  assetId: "asset-a", uploadSessionId: "session-a", fileName: "evidence.txt",
  mimeType: "text/plain", sizeBytes: 12,
};

test("synthetic storage driver satisfies the complete provider contract without network access", async () => {
  let now = Date.parse("2026-11-08T10:00:00.000Z");
  const driver = new SyntheticProviderStorageDriver({ now: () => now });
  assert.equal(assertProviderStorageDriver(driver), driver);
  assert.equal(driver.synthetic, true);

  const grant = await driver.createUploadGrant(context, upload, "request-1");
  assert.equal(grant.kind, "succeeded");
  if (grant.kind !== "succeeded") return;
  assert.equal(grant.providerUploadReference, "synthetic-object:session-a");
  assert.equal(new URL(grant.url).hostname, "storage.example.test");
  assert.equal(grant.method, "PUT");

  const lookup = await driver.lookupUpload(context, "session-a", "request-2");
  assert.deepEqual(lookup, { kind: "found", providerUploadReference: grant.providerUploadReference });

  const renewed = await driver.renewUploadGrant(context, {
    ...upload, providerUploadReference: grant.providerUploadReference,
  }, "request-3");
  assert.equal(renewed.kind, "succeeded");

  const verified = await driver.verifyObject(context, {
    uploadSessionId: "session-a", providerUploadReference: grant.providerUploadReference,
    expectedSizeBytes: 12, expectedMimeType: "text/plain", expectedSha256: "a".repeat(64),
  }, "request-4");
  assert.deepEqual(verified, {
    kind: "verified", sizeBytes: 12, mimeType: "text/plain", sha256: "a".repeat(64),
  });

  const scan = await driver.scanObject(context, {
    assetId: "asset-a", providerObjectReference: grant.providerUploadReference,
    expectedSha256: "a".repeat(64),
  }, "request-5");
  assert.deepEqual(scan, { kind: "clean", scanReference: "synthetic-scan-only" });

  const download = await driver.createDownloadGrant(context, {
    tenantId: "tenant-a", actorId: "actor-a", applicationId: "app-a",
    assetId: "asset-a", accessReference: grant.providerUploadReference, fileName: "evidence.txt",
  }, "request-6");
  assert.ok(download);
  assert.equal(new URL(download.url).hostname, "storage.example.test");
  assert.ok(Date.parse(download.expiresAt) > now);

  now += 1_000;
  const replay = await driver.createUploadGrant(context, upload, "request-7");
  assert.equal(replay.kind, "succeeded");
  if (replay.kind === "succeeded") assert.equal(replay.providerUploadReference, grant.providerUploadReference);
});

test("synthetic driver scopes lookup, verification, scanning and downloads to tenant/application", async () => {
  const driver = new SyntheticProviderStorageDriver();
  const grant = await driver.createUploadGrant(context, upload, "request-1");
  assert.equal(grant.kind, "succeeded");
  if (grant.kind !== "succeeded") return;

  const otherTenant = { ...context, tenantId: "tenant-b" };
  assert.deepEqual(await driver.lookupUpload(otherTenant, "session-a", "request-2"), { kind: "unknown" });
  assert.deepEqual(await driver.verifyObject(otherTenant, {
    uploadSessionId: "session-a", providerUploadReference: grant.providerUploadReference,
    expectedSizeBytes: 12, expectedMimeType: "text/plain", expectedSha256: "a".repeat(64),
  }, "request-3"), { kind: "not_found" });
  assert.deepEqual(await driver.scanObject(otherTenant, {
    assetId: "asset-a", providerObjectReference: grant.providerUploadReference,
    expectedSha256: "a".repeat(64),
  }, "request-4"), { kind: "error", retryable: false });
  assert.equal(await driver.createDownloadGrant(otherTenant, {
    tenantId: "tenant-b", actorId: "actor-b", applicationId: "app-a",
    assetId: "asset-a", accessReference: grant.providerUploadReference, fileName: "evidence.txt",
  }, "request-5"), null);
});

test("synthetic driver rejects conflicting reuse of an upload session", async () => {
  const driver = new SyntheticProviderStorageDriver();
  const first = await driver.createUploadGrant(context, upload, "request-1");
  assert.equal(first.kind, "succeeded");
  const conflict = await driver.createUploadGrant(context, { ...upload, sizeBytes: 13 }, "request-2");
  assert.deepEqual(conflict, { kind: "rejected", rejectionCode: "idempotency_conflict" });
});

test("synthetic scanner can be configured to fail closed for negative-path testing", async () => {
  const driver = new SyntheticProviderStorageDriver({ scanOutcome: { kind: "error", retryable: true } });
  const grant = await driver.createUploadGrant(context, upload, "request-1");
  assert.equal(grant.kind, "succeeded");
  if (grant.kind !== "succeeded") return;
  assert.deepEqual(await driver.scanObject(context, {
    assetId: "asset-a", providerObjectReference: grant.providerUploadReference,
    expectedSha256: "a".repeat(64),
  }, "request-2"), { kind: "error", retryable: true });
});
