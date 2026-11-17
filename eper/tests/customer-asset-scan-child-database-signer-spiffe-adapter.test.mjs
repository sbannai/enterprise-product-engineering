import test from "node:test";
import assert from "node:assert/strict";
import {
  createCustomerAssetScanChildSignerSpiffeSdkRuntime,
} from "../dist/packages/assets/customer-asset-scan-child-database-signer-spiffe-adapter.js";

const audience = "eper:customer-asset-scan-child";
const token = "fixture.jwt.svid-value-with-sufficient-length";
const spiffeId = "spiffe://eper.example/asset-scanner/child";

test("signer SDK adapter validates SVID using its own configured Workload API client", async () => {
  const calls = [];
  let closed = 0;
  class FakeSpiffeClient {
    constructor(options) { calls.push({ options }); }
    async validateJwt(actualAudience, actualToken) {
      calls.push({ actualAudience, actualToken });
      return { spiffeId, claims: { exp: 1_800_000_060 } };
    }
    async close() { closed += 1; }
  }
  const runtime = createCustomerAssetScanChildSignerSpiffeSdkRuntime({
    endpoint: "unix:///run/spire/sockets/agent.sock",
    SpiffeClient: FakeSpiffeClient,
  });
  assert.deepEqual(await runtime.validator.validateJwt(audience, token), {
    spiffeId, claims: { exp: 1_800_000_060 },
  });
  assert.deepEqual(calls, [
    { options: { connection: "unix:///run/spire/sockets/agent.sock", retry: { enabled: false } } },
    { actualAudience: audience, actualToken: token },
  ]);
  await runtime.close();
  await runtime.close();
  assert.equal(closed, 1);
});

test("signer SDK adapter rejects non-local or unsafe Workload API endpoints", () => {
  class FakeSpiffeClient {
    constructor() { throw new Error("must not construct SDK"); }
  }
  for (const endpoint of [
    "https://spire.example",
    "unix://relative.sock",
    "unix:///run/spire/../agent.sock",
    "unix:///run/spire/agent.sock?debug=1",
  ]) {
    assert.throws(() => createCustomerAssetScanChildSignerSpiffeSdkRuntime({
      endpoint, SpiffeClient: FakeSpiffeClient,
    }), { message: "CUSTOMER_ASSET_SCAN_CHILD_SIGNER_SPIFFE_SOCKET_INVALID" });
  }
});
