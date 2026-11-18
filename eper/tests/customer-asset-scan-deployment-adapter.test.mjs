import assert from "node:assert/strict";
import test from "node:test";
import { createCustomerAssetScanDeploymentAdapter } from "../dist/packages/assets/customer-asset-scan-deployment-adapter.js";

const SPIFFE_ID = "spiffe://example.org/eper/scanner/worker";

function fixture() {
  const closed = [];
  const host = {
    createIdentityServices({ registerCleanup }) {
      registerCleanup(async () => { closed.push("workload-api-client"); });
      return {
        workloadApiClient: {
          async fetchJwtSvid({ audience, spiffeId }) {
            assert.deepEqual(audience, ["eper:customer-asset-scan-child"]);
            assert.equal(spiffeId, SPIFFE_ID);
            return [{ spiffeId: SPIFFE_ID, expiresAtMs: Date.now() + 120_000, jwtSvid: "opaque-test-jwt-svid-value" }];
          },
        },
        expectedSpiffeId: SPIFFE_ID,
        issuer: { async issue() { return { databaseRole: "eper_scanner_child", expiresAt: Math.floor(Date.now() / 1000) + 60, clientCertificatePem: "certificate" }; } },
        caPem: "test-ca",
        databaseCaPem: "test-database-ca",
      };
    },
    createRuntimeServices({ registerCleanup }) {
      registerCleanup(async () => { closed.push("scanner-runtime"); });
      return {
        provider: { async dispatch() { return {}; } },
        scanner: { async scan() { return { scanStatus: "clean" }; } },
      };
    },
  };
  return { adapter: createCustomerAssetScanDeploymentAdapter(host), closed, host };
}

test("platform-neutral adapter maps host facilities to the existing EPER child contracts", async () => {
  const { adapter } = fixture();
  const bootstrap = await adapter.createCustomerAssetScanChildDatabaseTlsBootstrap({
    env: {}, signal: new AbortController().signal,
  });
  const identity = await bootstrap.identity.verifyCurrentProcessIdentity();
  assert.equal(identity.spiffeId, SPIFFE_ID);
  assert.equal(identity.audience, "eper:customer-asset-scan-child");

  const composition = await adapter.createCustomerAssetScanChildRuntimeDependencies({
    pool: { async end() {}, async query() { return { rows: [] }; } },
    env: {}, identity: bootstrap.identity, signal: new AbortController().signal,
    registerCleanup() {},
  });
  assert.equal(composition.identity, bootstrap.identity);
  assert.equal(typeof composition.input.resolve, "function");
  assert.equal(typeof composition.provider.dispatch, "function");
  assert.equal(typeof composition.scanner.scan, "function");
});

test("adapter closes acquired host resources in reverse order and close is idempotent", async () => {
  const { adapter, closed } = fixture();
  const bootstrap = await adapter.createCustomerAssetScanChildDatabaseTlsBootstrap({
    env: {}, signal: new AbortController().signal,
  });
  await adapter.createCustomerAssetScanChildRuntimeDependencies({
    pool: { async end() {}, async query() { return { rows: [] }; } },
    env: {}, identity: bootstrap.identity, signal: new AbortController().signal,
    registerCleanup() {},
  });
  await bootstrap.close?.();
  await bootstrap.close?.();
  assert.deepEqual(closed, ["scanner-runtime", "workload-api-client"]);
});

test("adapter rejects runtime composition with an identity other than its verified bootstrap identity", async () => {
  const { adapter } = fixture();
  await adapter.createCustomerAssetScanChildDatabaseTlsBootstrap({
    env: {}, signal: new AbortController().signal,
  });
  await assert.rejects(
    adapter.createCustomerAssetScanChildRuntimeDependencies({
      pool: { async end() {}, async query() { return { rows: [] }; } },
      env: {}, identity: { async verifyCurrentProcessIdentity() { return {}; } },
      signal: new AbortController().signal, registerCleanup() {},
    }),
    /CUSTOMER_ASSET_SCAN_DEPLOYMENT_IDENTITY_MISMATCH/,
  );
});

test("adapter cleans partially initialized host identity services when factory throws", async () => {
  const closed = [];
  const adapter = createCustomerAssetScanDeploymentAdapter({
    createIdentityServices({ registerCleanup }) {
      registerCleanup(async () => { closed.push("partial-sdk-client"); });
      throw new Error("host initialization failed");
    },
    createRuntimeServices() {
      throw new Error("must not be called");
    },
  });
  await assert.rejects(
    adapter.createCustomerAssetScanChildDatabaseTlsBootstrap({
      env: {}, signal: new AbortController().signal,
    }),
    /host initialization failed/,
  );
  assert.deepEqual(closed, ["partial-sdk-client"]);
});

test("adapter rejects duplicate factory invocation and malformed host contracts", async () => {
  const { adapter } = fixture();
  const bootstrap = await adapter.createCustomerAssetScanChildDatabaseTlsBootstrap({
    env: {}, signal: new AbortController().signal,
  });
  await assert.rejects(
    adapter.createCustomerAssetScanChildDatabaseTlsBootstrap({
      env: {}, signal: new AbortController().signal,
    }),
    /BOOTSTRAP_ALREADY_CREATED/,
  );
  await adapter.createCustomerAssetScanChildRuntimeDependencies({
    pool: { async end() {}, async query() { return { rows: [] }; } },
    env: {}, identity: bootstrap.identity, signal: new AbortController().signal,
    registerCleanup() {},
  });
  await assert.rejects(
    adapter.createCustomerAssetScanChildRuntimeDependencies({
      pool: { async end() {}, async query() { return { rows: [] }; } },
      env: {}, identity: bootstrap.identity, signal: new AbortController().signal,
      registerCleanup() {},
    }),
    /RUNTIME_ALREADY_CREATED/,
  );
  assert.throws(() => createCustomerAssetScanDeploymentAdapter({}), /HOST_INVALID/);
});
