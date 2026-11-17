import test from "node:test";
import assert from "node:assert/strict";
import {
  CustomerAssetScanChildSpiffeSdkAdapter,
  createCustomerAssetScanChildSpiffeSdkRuntime,
} from "../dist/packages/assets/customer-asset-scan-child-spiffe-sdk-adapter.js";
import {
  CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE,
} from "../dist/packages/assets/customer-asset-scan-child-spiffe-identity.js";

const spiffeId = "spiffe://eper.example/asset-scanner/child";

test("SPIFFE SDK adapter requests exactly the configured audience and workload ID", async () => {
  const signal = new AbortController().signal;
  const calls = [];
  const adapter = new CustomerAssetScanChildSpiffeSdkAdapter({
    async getJwtSvid(...args) {
      calls.push(args);
      return { spiffeId, token: "opaque-jwt-svid", expiresAtMs: 1_800_000_060_000 };
    },
  });

  const result = await adapter.fetchJwtSvid({
    audience: [CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE],
    spiffeId,
    signal,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE);
  assert.deepEqual(calls[0][1], { spiffeId });
  assert.equal(calls[0][2], signal);
  assert.deepEqual(result, [{ spiffeId, expiresAtMs: 1_800_000_060_000 }]);
  assert.equal(JSON.stringify(result).includes("opaque-jwt-svid"), false);
});

test("SPIFFE SDK adapter returns no identity when Workload API returns no SVID", async () => {
  const adapter = new CustomerAssetScanChildSpiffeSdkAdapter({
    async getJwtSvid() { return null; },
  });
  assert.deepEqual(await adapter.fetchJwtSvid({
    audience: [CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE],
    spiffeId,
  }), []);
});

test("SPIFFE SDK adapter rejects an empty token instead of accepting malformed SDK output", async () => {
  const adapter = new CustomerAssetScanChildSpiffeSdkAdapter({
    async getJwtSvid() {
      return { spiffeId, token: "", expiresAtMs: 1_800_000_060_000 };
    },
  });
  await assert.rejects(() => adapter.fetchJwtSvid({
    audience: [CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE],
    spiffeId,
  }), /CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_SVID_INVALID/);
});

test("SPIFFE SDK runtime uses only the explicit Unix socket and disables SDK retries", async () => {
  const constructions = [];
  let closeCalls = 0;
  class FakeSpiffeClient {
    constructor(options) { constructions.push(options); }
    async getJwtSvid() {
      return { spiffeId, token: "opaque-jwt-svid", expiresAtMs: 1_800_000_060_000 };
    }
    async close() { closeCalls += 1; }
  }

  const runtime = createCustomerAssetScanChildSpiffeSdkRuntime({
    endpoint: "unix:///run/spire/sockets/agent.sock",
    SpiffeClient: FakeSpiffeClient,
  });
  assert.deepEqual(constructions, [{
    connection: "unix:///run/spire/sockets/agent.sock",
    retry: { enabled: false },
  }]);
  await runtime.close();
  await runtime.close();
  assert.equal(closeCalls, 1);
});

test("SPIFFE SDK runtime attempts close once and propagates cleanup failure", async () => {
  const cleanupFailure = new Error("SDK transport close failed");
  let closeCalls = 0;
  class FailingCloseClient {
    async getJwtSvid() { return null; }
    async close() {
      closeCalls += 1;
      throw cleanupFailure;
    }
  }
  const runtime = createCustomerAssetScanChildSpiffeSdkRuntime({
    endpoint: "unix:///run/spire/agent/api.sock",
    SpiffeClient: FailingCloseClient,
  });
  await assert.rejects(runtime.close(), (error) => error === cleanupFailure);
  // A failed close is not retried implicitly: the caller sees the cleanup
  // failure and can fail the child attempt without duplicate SDK teardown.
  await runtime.close();
  assert.equal(closeCalls, 1);
});

test("SPIFFE SDK runtime rejects missing, relative, non-Unix and traversal socket endpoints", () => {
  class FakeSpiffeClient {
    constructor() { throw new Error("constructor must not run for invalid endpoints"); }
  }
  for (const endpoint of [
    "",
    "relative/agent.sock",
    "https://spire.example/socket",
    "unix://relative/agent.sock",
    "unix:///run/spire/../other/agent.sock",
    "unix:///run/spire/agent.sock?override=true",
    "unix:///run/spire/agent socket.sock",
  ]) {
    assert.throws(() => createCustomerAssetScanChildSpiffeSdkRuntime({
      endpoint,
      SpiffeClient: FakeSpiffeClient,
    }), /CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_SOCKET_INVALID/);
  }
});
