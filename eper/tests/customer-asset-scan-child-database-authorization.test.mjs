import test from "node:test";
import assert from "node:assert/strict";
import {
  CustomerAssetScanChildDatabaseAuthorizationService,
  CustomerAssetScanChildDatabaseAuthorizationError,
} from "../dist/packages/assets/customer-asset-scan-child-database-authorization.js";
import {
  CustomerAssetScanChildSpiffeIdentityVerifier,
} from "../dist/packages/assets/customer-asset-scan-child-spiffe-identity.js";

const start = {
  version: 3, type: "start", jobToken: "a".repeat(64), claimGeneration: 4,
  requestId: "scan-request-4", workerId: "worker-from-ipc",
  scannerServiceId: "scanner-from-ipc",
  input: { tenantId: "tenant-from-ipc", applicationId: "app-from-ipc",
    assetId: "11111111-1111-4111-8111-111111111111",
    checksumSha256: "a".repeat(64), sizeBytes: 1, mimeType: "text/plain" },
};
const spiffeId = "spiffe://eper.example/scanner/child";
const workload = await new CustomerAssetScanChildSpiffeIdentityVerifier({
  async fetchJwtSvid() { return [{ spiffeId, expiresAtMs: Date.now() + 120_000 }]; },
}, spiffeId).verifyCurrentProcessIdentity();
const context = Object.freeze({
  tenantId: "tenant-db", applicationId: "app-db", workerId: "worker-db",
  scannerServiceId: "scanner-db", providerConnectionId: "connection-db",
  assetId: start.input.assetId, storageAdapterKey: "storage.v1",
  providerObjectReference: "object", providerUploadReference: "upload",
  checksumSha256: "a".repeat(64), sizeBytes: 1, mimeType: "text/plain",
  attempt: 1,
});

test("resolves credentials only from authenticated DB-derived scope, never IPC scope", async () => {
  const calls = [];
  const service = new CustomerAssetScanChildDatabaseAuthorizationService(
    { async resolve(input) { assert.deepEqual(input, { start, workload }); return context; } },
    { async resolveScanCredentials(input) { calls.push(input); return { secret: "child-local" }; } },
  );
  const result = await service.authorize({ start, workload });
  assert.deepEqual(calls, [{
    tenantId: "tenant-db", applicationId: "app-db", connectionId: "connection-db",
    scannerServiceId: "scanner-db", capability: "storage.object.read.internal",
  }]);
  assert.equal(result.context, context);
  assert.deepEqual(result.credentials, { secret: "child-local" });
});

test("fails closed when DB-derived provider credential resolution fails", async () => {
  const service = new CustomerAssetScanChildDatabaseAuthorizationService(
    { async resolve() { return context; } },
    { async resolveScanCredentials() { throw new Error("secret provider diagnostic"); } },
  );
  await assert.rejects(() => service.authorize({ start, workload }), error =>
    error instanceof CustomerAssetScanChildDatabaseAuthorizationError &&
    !error.message.includes("secret provider diagnostic"));
});

test("rejects absent provider credentials", async () => {
  const service = new CustomerAssetScanChildDatabaseAuthorizationService(
    { async resolve() { return context; } },
    { async resolveScanCredentials() { return undefined; } },
  );
  await assert.rejects(() => service.authorize({ start, workload }), {
    code: "CUSTOMER_ASSET_SCAN_CHILD_DATABASE_AUTHORIZATION_UNAVAILABLE",
  });
});

test("rejects a caller-constructed identity even when its fields look valid", async () => {
  let resolverCalls = 0;
  const forged = { ...workload };
  const service = new CustomerAssetScanChildDatabaseAuthorizationService(
    { async resolve() { resolverCalls += 1; return context; } },
    { async resolveScanCredentials() { return { secret: "must-not-resolve" }; } },
  );
  await assert.rejects(() => service.authorize({ start, workload: forged }), {
    code: "CUSTOMER_ASSET_SCAN_CHILD_DATABASE_AUTHORIZATION_UNAVAILABLE",
  });
  assert.equal(resolverCalls, 0);
});
