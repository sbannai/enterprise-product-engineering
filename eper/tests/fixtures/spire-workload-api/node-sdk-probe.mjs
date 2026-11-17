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
  CustomerAssetScanChildSpiffeIdentityError,
  CustomerAssetScanChildSpiffeIdentityVerifier,
} = await import("/eper/dist/packages/assets/customer-asset-scan-child-spiffe-identity.js");

const expectedSpiffeId = "spiffe://example.org/ns/scanner/sa/customer-asset-scan-child";

// The fixture can rerun this probe after the socket mode is changed to 000.
// This proves a real OS-level permission denial through the production adapter.
if (process.env.SPIRE_PROBE_EXPECT_DENIED === "1") {
  const deniedRuntime = createCustomerAssetScanChildSpiffeSdkRuntime({
    endpoint: "unix:///run/spire/agent/public/api.sock",
    SpiffeClient,
  });
  try {
    const deniedVerifier = new CustomerAssetScanChildSpiffeIdentityVerifier(
      deniedRuntime.adapter,
      expectedSpiffeId,
    );
    await assert.rejects(
      deniedVerifier.verifyCurrentProcessIdentity(AbortSignal.timeout(3_000)),
      (error) => error instanceof CustomerAssetScanChildSpiffeIdentityError &&
        error.code === "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_UNAVAILABLE",
    );
    console.log("PASS: permission-denied Workload API socket fails closed as unavailable");
  } finally {
    await deniedRuntime.close();
  }
  process.exit(0);
}
const runtime = createCustomerAssetScanChildSpiffeSdkRuntime({
  endpoint: "unix:///run/spire/agent/public/api.sock",
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

  // Abort an in-flight Workload API request and prove the supervisor's reason
  // is preserved rather than being classified as socket unavailability.
  const cancellation = new Error("scanner child attempt cancelled");
  const controller = new AbortController();
  const pendingIdentity = verifier.verifyCurrentProcessIdentity(controller.signal);
  controller.abort(cancellation);
  await assert.rejects(
    pendingIdentity,
    (error) => error === cancellation,
  );
  console.log("PASS: in-flight SDK Workload API request preserves supervisor cancellation");
} finally {
  await runtime.close();
}

// A missing socket must fail closed through the same SDK adapter and verifier;
// it must never fall back to ambient credentials or another endpoint.
const unavailableRuntime = createCustomerAssetScanChildSpiffeSdkRuntime({
  endpoint: "unix:///run/spire/agent/public/not-present.sock",
  SpiffeClient,
});
try {
  const unavailableVerifier = new CustomerAssetScanChildSpiffeIdentityVerifier(
    unavailableRuntime.adapter,
    expectedSpiffeId,
  );
  await assert.rejects(
    unavailableVerifier.verifyCurrentProcessIdentity(AbortSignal.timeout(3_000)),
    (error) => error instanceof CustomerAssetScanChildSpiffeIdentityError &&
      error.code === "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_UNAVAILABLE",
  );
  console.log("PASS: missing Workload API socket fails closed as unavailable");
} finally {
  await unavailableRuntime.close();
}
