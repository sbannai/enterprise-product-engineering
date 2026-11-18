import test from "node:test";
import assert from "node:assert/strict";
import {
  CustomerAssetScanChildSpiffeSdkAdapter,
} from "../dist/packages/assets/customer-asset-scan-child-spiffe-sdk-adapter.js";
import {
  CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE,
  CustomerAssetScanChildSpiffeIdentityVerifier,
} from "../dist/packages/assets/customer-asset-scan-child-spiffe-identity.js";

const spiffeId = "spiffe://eper.example/asset-scanner/child";
const now = 1_794_312_000_000;
const expiresAtMs = now + 120_000;

function verifierForSdkResult(svid) {
  const adapter = new CustomerAssetScanChildSpiffeSdkAdapter({
    async getJwtSvid(audience, filter, signal) {
      assert.equal(audience, CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE);
      assert.deepEqual(filter, { spiffeId });
      assert.equal(signal, undefined);
      return svid;
    },
  });
  return new CustomerAssetScanChildSpiffeIdentityVerifier(adapter, spiffeId, () => now);
}

test("real SDK adapter boundary and identity verifier accept one exact, short-lived child SVID", async () => {
  const verifier = verifierForSdkResult({
    spiffeId,
    token: "opaque-bearer-token-1",
    expiresAtMs,
  });
  const identity = await verifier.verifyCurrentProcessIdentity();
  assert.equal(identity.spiffeId, spiffeId);
  assert.equal(identity.audience, CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE);
  assert.equal(identity.expiresAt, Math.floor(expiresAtMs / 1000));
  assert.equal(JSON.stringify(identity).includes("opaque-bearer-token-1"), false);
});

test("SDK adapter result with an unexpected SPIFFE ID is rejected by the identity verifier", async () => {
  const verifier = verifierForSdkResult({
    spiffeId: "spiffe://eper.example/another-workload",
    token: "opaque-bearer-token-1",
    expiresAtMs,
  });
  await assert.rejects(verifier.verifyCurrentProcessIdentity(), {
    code: "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_INVALID",
  });
});

test("SDK adapter result with expired or excessive SVID lifetime is rejected", async () => {
  for (const invalidExpiry of [now - 1, now + 301_000]) {
    const verifier = verifierForSdkResult({
      spiffeId,
      token: "opaque-bearer-token-1",
      expiresAtMs: invalidExpiry,
    });
    await assert.rejects(verifier.verifyCurrentProcessIdentity(), {
      code: "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_INVALID",
    });
  }
});

test("SDK adapter result without a token fails closed before identity verification", async () => {
  const verifier = verifierForSdkResult({ spiffeId, token: "", expiresAtMs });
  await assert.rejects(verifier.verifyCurrentProcessIdentity(), {
    code: "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_INVALID",
  });
});
