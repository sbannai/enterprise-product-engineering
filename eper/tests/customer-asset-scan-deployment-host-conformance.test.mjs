import assert from "node:assert/strict";
import test from "node:test";
import { createCustomerAssetScanDeploymentAdapter } from "../dist/packages/assets/customer-asset-scan-deployment-adapter.js";

const SPIFFE_ID = "spiffe://example.org/eper/scanner/worker";

function identityServices() {
  return {
    workloadApiClient: {
      async fetchJwtSvid({ audience, spiffeId }) {
        assert.deepEqual(audience, ["eper:customer-asset-scan-child"]);
        assert.equal(spiffeId, SPIFFE_ID);
        return [{
          spiffeId: SPIFFE_ID,
          expiresAtMs: Date.now() + 120_000,
          jwtSvid: "opaque-conformance-test-svid",
        }];
      },
    },
    expectedSpiffeId: SPIFFE_ID,
    issuer: {
      async issue() {
        return {
          databaseRole: "eper_scanner_child",
          expiresAt: Math.floor(Date.now() / 1000) + 60,
          clientCertificatePem: "test-client-certificate",
        };
      },
    },
    caPem: "test-workload-ca",
    databaseCaPem: "test-database-ca",
  };
}

const pool = {
  async end() {},
  async query() { return { rows: [] }; },
};

test("deployment host receives the caller abort signal at identity and runtime boundaries", async () => {
  const identitySignal = new AbortController().signal;
  const runtimeSignal = new AbortController().signal;
  let receivedIdentitySignal;
  let receivedRuntimeSignal;

  const adapter = createCustomerAssetScanDeploymentAdapter({
    createIdentityServices(input) {
      receivedIdentitySignal = input.signal;
      return identityServices();
    },
    createRuntimeServices(input) {
      receivedRuntimeSignal = input.signal;
      return {
        provider: { async dispatch() { return {}; } },
        scanner: { async scan() { return { scanStatus: "clean" }; } },
      };
    },
  });

  const bootstrap = await adapter.createCustomerAssetScanChildDatabaseTlsBootstrap({
    env: {}, signal: identitySignal,
  });
  await adapter.createCustomerAssetScanChildRuntimeDependencies({
    pool, env: {}, identity: bootstrap.identity, signal: runtimeSignal,
    registerCleanup() {},
  });

  assert.equal(receivedIdentitySignal, identitySignal);
  assert.equal(receivedRuntimeSignal, runtimeSignal);
  await bootstrap.close?.();
});

test("an already-aborted identity bootstrap fails closed and releases host resources", async () => {
  const controller = new AbortController();
  controller.abort();
  const closed = [];
  let runtimeFactoryCalled = false;

  const adapter = createCustomerAssetScanDeploymentAdapter({
    createIdentityServices({ signal, registerCleanup }) {
      assert.equal(signal, controller.signal);
      registerCleanup(() => { closed.push("identity-client"); });
      if (signal.aborted) throw new Error("HOST_ABORTED_BEFORE_IDENTITY_READY");
      return identityServices();
    },
    createRuntimeServices() {
      runtimeFactoryCalled = true;
      throw new Error("runtime factory must not be called");
    },
  });

  await assert.rejects(
    adapter.createCustomerAssetScanChildDatabaseTlsBootstrap({
      env: {}, signal: controller.signal,
    }),
    /HOST_ABORTED_BEFORE_IDENTITY_READY/,
  );
  assert.deepEqual(closed, ["identity-client"]);
  assert.equal(runtimeFactoryCalled, false);
});

test("runtime host failure preserves registered cleanup and closes the adapter once", async () => {
  const closed = [];
  const adapter = createCustomerAssetScanDeploymentAdapter({
    createIdentityServices({ registerCleanup }) {
      registerCleanup(() => { closed.push("identity-client"); });
      return identityServices();
    },
    createRuntimeServices({ registerCleanup }) {
      registerCleanup(() => { closed.push("provider-client"); });
      throw new Error("HOST_RUNTIME_INITIALIZATION_FAILED");
    },
  });

  const bootstrap = await adapter.createCustomerAssetScanChildDatabaseTlsBootstrap({
    env: {}, signal: new AbortController().signal,
  });
  await assert.rejects(
    adapter.createCustomerAssetScanChildRuntimeDependencies({
      pool, env: {}, identity: bootstrap.identity,
      signal: new AbortController().signal, registerCleanup() {},
    }),
    /HOST_RUNTIME_INITIALIZATION_FAILED/,
  );

  await bootstrap.close?.();
  await bootstrap.close?.();
  assert.deepEqual(closed, ["provider-client", "identity-client"]);
});
