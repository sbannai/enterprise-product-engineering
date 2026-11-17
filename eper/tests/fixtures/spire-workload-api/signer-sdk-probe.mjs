import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire("/sdk/package.json");
const sdkEntry = require.resolve("@jeengbe/spiffe");
const { SpiffeClient } = await import(pathToFileURL(sdkEntry).href);
const { createCustomerAssetScanChildSignerSpiffeSdkRuntime } = await import(
  "/eper/dist/packages/assets/customer-asset-scan-child-database-signer-spiffe-adapter.js"
);

const expectedSignerId = "spiffe://example.org/ns/scanner/sa/customer-asset-scan-signer";
const runtime = createCustomerAssetScanChildSignerSpiffeSdkRuntime({
  endpoint: "unix:///run/spire/agent/public/api.sock",
  SpiffeClient,
});
try {
  const svid = await new SpiffeClient({
    connection: "unix:///run/spire/agent/public/api.sock",
    retry: { enabled: false },
  }).getJwtSvid("eper:customer-asset-scan-child", { spiffeId: expectedSignerId });
  assert.ok(svid, "signer workload must obtain its own registered identity");
  assert.equal(svid.spiffeId, expectedSignerId);
  const independentlyValidated = await runtime.validator.validateJwt(
    "eper:customer-asset-scan-child",
    svid.token,
  );
  assert.equal(independentlyValidated?.spiffeId, expectedSignerId);
  assert.ok(independentlyValidated.claims.exp > Math.floor(Date.now() / 1000));
  console.log("PASS: separate signer process obtained and independently validated its own JWT-SVID");
} finally {
  await runtime.close();
}
