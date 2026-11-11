import test from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOMER_ASSET_SCAN_CHILD_AUDIENCE,
  CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY,
  CustomerAssetScanChildIdentityError,
  CustomerAssetScanChildIdentityService,
  requireCustomerAssetScanChildIdentityRuntime,
} from "../dist/packages/assets/customer-asset-scan-child-identity.js";

const now = 1_800_000_000;
const claims = (overrides = {}) => ({
  issuer: "eper-workload-identity",
  subject: "scanner-child-481",
  audience: CUSTOMER_ASSET_SCAN_CHILD_AUDIENCE,
  tenantId: "tenant-1",
  applicationId: "application-1",
  connectionId: "connection-7",
  scannerServiceId: "scanner.synthetic.v1",
  capability: CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY,
  issuedAt: now - 10,
  expiresAt: now + 120,
  tokenId: "workload-token-unique-1",
  ...overrides,
});
const fixture = ({ identity = claims(), credentials = { marker: "synthetic-only" }, verifyError } = {}) => {
  const calls = [];
  const service = new CustomerAssetScanChildIdentityService(
    { async verifyCurrentProcessIdentity() {
      if (verifyError) throw verifyError;
      return identity;
    } },
    { async resolveScanCredentials(input) {
      calls.push(input);
      return credentials;
    } },
    { now: () => now * 1000 },
  );
  return { service, calls };
};

test("child identity is independently verified and pinned to tenant, application, scanner and scan-only capability", async () => {
  const { service, calls } = fixture();
  const result = await service.authorize({
    tenantId: "tenant-1", applicationId: "application-1", scannerServiceId: "scanner.synthetic.v1",
  });
  assert.equal(result.identity.capability, "storage.object.scan");
  assert.equal(result.credentials.marker, "synthetic-only");
  assert.deepEqual(calls, [{
    tenantId: "tenant-1", applicationId: "application-1", connectionId: "connection-7",
    scannerServiceId: "scanner.synthetic.v1", capability: "storage.object.scan",
  }]);
});

test("child identity rejects tenant, application, scanner and capability scope drift", async () => {
  for (const [identity, request] of [
    [claims({ tenantId: "other-tenant" }), { tenantId: "tenant-1", applicationId: "application-1", scannerServiceId: "scanner.synthetic.v1" }],
    [claims({ applicationId: "other-app" }), { tenantId: "tenant-1", applicationId: "application-1", scannerServiceId: "scanner.synthetic.v1" }],
    [claims({ scannerServiceId: "other-scanner" }), { tenantId: "tenant-1", applicationId: "application-1", scannerServiceId: "scanner.synthetic.v1" }],
    [claims({ capability: "storage.upload.grant" }), { tenantId: "tenant-1", applicationId: "application-1", scannerServiceId: "scanner.synthetic.v1" }],
  ]) {
    const { service, calls } = fixture({ identity });
    await assert.rejects(service.authorize(request), error =>
      error instanceof CustomerAssetScanChildIdentityError &&
      error.code === "CUSTOMER_ASSET_SCAN_CHILD_SCOPE_MISMATCH");
    assert.equal(calls.length, 0, "credentials must not resolve for an invalid identity scope");
  }
});

test("child identity rejects expired, future-issued and overlong attestations", async () => {
  for (const identity of [
    claims({ expiresAt: now - 60 }),
    claims({ issuedAt: now + 120 }),
    claims({ expiresAt: now + 901 }),
  ]) {
    const { service, calls } = fixture({ identity });
    await assert.rejects(service.authorize({
      tenantId: "tenant-1", applicationId: "application-1", scannerServiceId: "scanner.synthetic.v1",
    }), error => error instanceof CustomerAssetScanChildIdentityError &&
      error.code === "CUSTOMER_ASSET_SCAN_CHILD_IDENTITY_EXPIRED");
    assert.equal(calls.length, 0);
  }
});

test("child identity rejects malformed and extra claims", async () => {
  for (const identity of [
    claims({ extraSecret: "must-not-be-accepted" }),
    claims({ tokenId: "" }),
    claims({ audience: "eper:api" }),
  ]) {
    const { service } = fixture({ identity });
    await assert.rejects(service.authorize({
      tenantId: "tenant-1", applicationId: "application-1", scannerServiceId: "scanner.synthetic.v1",
    }), error => error instanceof CustomerAssetScanChildIdentityError &&
      error.code === "CUSTOMER_ASSET_SCAN_CHILD_IDENTITY_INVALID");
  }
});

test("child identity fails closed when workload proof or scan credentials are unavailable", async () => {
  const unavailable = fixture({ verifyError: new Error("sensitive platform detail") });
  await assert.rejects(unavailable.service.authorize({
    tenantId: "tenant-1", applicationId: "application-1", scannerServiceId: "scanner.synthetic.v1",
  }), /CUSTOMER_ASSET_SCAN_CHILD_IDENTITY_UNAVAILABLE/);

  const missingCredentials = fixture({ credentials: null });
  await assert.rejects(missingCredentials.service.authorize({
    tenantId: "tenant-1", applicationId: "application-1", scannerServiceId: "scanner.synthetic.v1",
  }), /CUSTOMER_ASSET_SCAN_CHILD_CREDENTIALS_UNAVAILABLE/);
});

test("production runtime requires independent verifier and resolver and rejects synthetic adapters", () => {
  assert.throws(() => requireCustomerAssetScanChildIdentityRuntime({ environment: "production" }),
    /CUSTOMER_ASSET_SCAN_CHILD_RUNTIME_DISABLED/);
  const verifier = { async verifyCurrentProcessIdentity() { return claims(); } };
  const credentials = { async resolveScanCredentials() { return { marker: "test" }; } };
  assert.throws(() => requireCustomerAssetScanChildIdentityRuntime({
    environment: "production", verifier, credentials, synthetic: true,
  }), /CUSTOMER_ASSET_SCAN_CHILD_RUNTIME_DISABLED/);
  assert.doesNotThrow(() => requireCustomerAssetScanChildIdentityRuntime({
    environment: "test", verifier, credentials, synthetic: true,
  }));
});
