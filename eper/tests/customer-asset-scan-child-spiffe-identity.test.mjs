import test from "node:test";
import assert from "node:assert/strict";
import {
  CustomerAssetScanChildSpiffeSdkAdapter,
} from "../dist/packages/assets/customer-asset-scan-child-spiffe-sdk-adapter.js";
import {
  CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE,
  CustomerAssetScanChildSpiffeIdentityError,
  CustomerAssetScanChildSpiffeIdentityVerifier,
} from "../dist/packages/assets/customer-asset-scan-child-spiffe-identity.js";

const spiffeId = "spiffe://eper.example/asset-scanner/child";
const now = 1_794_312_000_000;
const expiresAtMs = now + 120_000;

function client({ fetched, fetchError } = {}) {
  const calls = [];
  return {
    calls,
    async fetchJwtSvid(input) {
      calls.push(input);
      if (fetchError) throw fetchError;
      return fetched ?? [{ spiffeId, expiresAtMs }];
    },
  };
}

test("SPIFFE verifier obtains the current process SVID for the fixed audience and exact identity", async () => {
  const api = client();
  const verifier = new CustomerAssetScanChildSpiffeIdentityVerifier(api, spiffeId, () => now);
  const identity = await verifier.verifyCurrentProcessIdentity();
  assert.equal(identity.spiffeId, spiffeId);
  assert.equal(identity.trustDomain, "eper.example");
  assert.equal(identity.audience, CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE);
  assert.equal(identity.expiresAt, Math.floor(expiresAtMs / 1000));
  assert.deepEqual(api.calls, [{
    audience: [CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE],
    spiffeId,
  }]);
});

test("SPIFFE verifier rejects an unexpected, missing, or ambiguous fetched identity", async () => {
  for (const fetched of [
    [],
    [{ spiffeId: "spiffe://eper.example/other", expiresAtMs }],
    [{ spiffeId, expiresAtMs }, { spiffeId, expiresAtMs }],
    [{ spiffeId, expiresAtMs: Number.NaN }],
  ]) {
    const verifier = new CustomerAssetScanChildSpiffeIdentityVerifier(
      client({ fetched }), spiffeId, () => now,
    );
    await assert.rejects(verifier.verifyCurrentProcessIdentity(), {
      code: "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_INVALID",
    });
  }
});

test("SPIFFE verifier rejects expired and overlong SVID lifetimes", async () => {
  for (const expiry of [now - 1, now + 301_000]) {
    const verifier = new CustomerAssetScanChildSpiffeIdentityVerifier(
      client({ fetched: [{ spiffeId, expiresAtMs: expiry }] }), spiffeId, () => now,
    );
    await assert.rejects(verifier.verifyCurrentProcessIdentity(), {
      code: "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_INVALID",
    });
  }
});

test("SPIFFE verifier fails closed when the local Workload API is unavailable", async () => {
  const verifier = new CustomerAssetScanChildSpiffeIdentityVerifier(
    client({ fetchError: new Error("socket path and internal error must not escape") }),
    spiffeId, () => now,
  );
  await assert.rejects(verifier.verifyCurrentProcessIdentity(), {
    code: "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_UNAVAILABLE",
  });
});

test("SPIFFE verifier rejects malformed configured workload identities", () => {
  for (const invalid of [
    "https://eper.example/asset-scanner",
    "spiffe://eper.example/",
    "spiffe://eper.example/../admin",
    "spiffe://eper.example/path?query=1",
  ]) {
    assert.throws(
      () => new CustomerAssetScanChildSpiffeIdentityVerifier(client(), invalid, () => now),
      CustomerAssetScanChildSpiffeIdentityError,
    );
  }
});

test("SPIFFE SDK adapter requests the exact child identity and discards the bearer token", async () => {
  const sdkCalls = [];
  const adapter = new CustomerAssetScanChildSpiffeSdkAdapter({
    async getJwtSvid(audience, filter) {
      sdkCalls.push({ audience, filter });
      return { spiffeId, token: "do-not-propagate-this-token", expiresAtMs };
    },
  });
  const result = await adapter.fetchJwtSvid({
    audience: [CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE],
    spiffeId,
  });
  assert.deepEqual(sdkCalls, [{
    audience: CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE,
    filter: { spiffeId },
  }]);
  assert.deepEqual(result, [{ spiffeId, expiresAtMs }]);
  assert.equal(JSON.stringify(result).includes("do-not-propagate-this-token"), false);
});

test("SPIFFE SDK adapter returns no identity when the workload has no entitled SVID", async () => {
  const adapter = new CustomerAssetScanChildSpiffeSdkAdapter({
    async getJwtSvid() { return null; },
  });
  assert.deepEqual(await adapter.fetchJwtSvid({
    audience: [CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE],
    spiffeId,
  }), []);
});

test("SPIFFE SDK adapter rejects an SDK result without its opaque token", async () => {
  const adapter = new CustomerAssetScanChildSpiffeSdkAdapter({
    async getJwtSvid() { return { spiffeId, expiresAtMs }; },
  });
  await assert.rejects(adapter.fetchJwtSvid({
    audience: [CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE],
    spiffeId,
  }), { message: "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_SVID_INVALID" });
});
