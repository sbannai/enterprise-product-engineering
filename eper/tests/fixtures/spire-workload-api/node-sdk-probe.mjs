import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire("/sdk/package.json");
const sdkEntry = require.resolve("@jeengbe/spiffe");
const { SpiffeClient } = await import(pathToFileURL(sdkEntry).href);
const {
  createCustomerAssetScanChildSpiffeSdkRuntime,
} = await import("/eper/dist/packages/assets/customer-asset-scan-child-spiffe-sdk-adapter.js");
const {
  CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE,
  CustomerAssetScanChildSpiffeIdentityVerifier,
} = await import("/eper/dist/packages/assets/customer-asset-scan-child-spiffe-identity.js");

const endpoint = "unix:///run/spire/agent/public/api.sock";
const expectedSpiffeId = "spiffe://example.org/ns/scanner/sa/customer-asset-scan-child";
const runtime = createCustomerAssetScanChildSpiffeSdkRuntime({
  endpoint,
  SpiffeClient,
});
try {
  const verifier = new CustomerAssetScanChildSpiffeIdentityVerifier(
    runtime.adapter,
    expectedSpiffeId,
  );
  const identity = await verifier.verifyCurrentProcessIdentity(
    AbortSignal.timeout(10_000),
  );
  assert.equal(identity.spiffeId, expectedSpiffeId);
  assert.equal(identity.trustDomain, "example.org");
  assert.equal(identity.audience, CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE);
  assert.ok(identity.expiresAt > Math.floor(Date.now() / 1000));
  assert.ok(identity.expiresAt <= Math.floor(Date.now() / 1000) + 300);
  assert.equal(JSON.stringify(identity).includes("eyJ"), false);
  console.log("PASS: Node SDK obtained and EPER verified the current process JWT-SVID");
} finally {
  await runtime.close();
}
