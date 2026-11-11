import test from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE,
  CustomerAssetScanChildSpiffeIdentityError,
  CustomerAssetScanChildSpiffeIdentityVerifier,
} from "../dist/packages/assets/customer-asset-scan-child-spiffe-identity.js";

const spiffeId = "spiffe://eper.example/asset-scanner/child";
const now = 1_794_312_000_000;
function claims(overrides = {}) {
  return {
    iss: "eper.example",
    sub: spiffeId,
    aud: [CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE],
    iat: Math.floor(now / 1000) - 5,
    exp: Math.floor(now / 1000) + 120,
    jti: "svid-token-123",
    ...overrides,
  };
}
function client({ fetched, validated, fetchError, validateError } = {}) {
  const calls = [];
  return {
    calls,
    async fetchJwtSvid(input) {
      calls.push(["fetch", input]);
      if (fetchError) throw fetchError;
      return fetched ?? [{ spiffeId, svid: "opaque-jwt-svid-token" }];
    },
    async validateJwtSvid(input) {
      calls.push(["validate", { audience: input.audience, tokenPresent: Boolean(input.svid) }]);
      if (validateError) throw validateError;
      return validated ?? { spiffeId, claims: claims() };
    },
  };
}

test("SPIFFE verifier fetches a child-local JWT-SVID and delegates validation to Workload API", async () => {
  const api = client();
  const verifier = new CustomerAssetScanChildSpiffeIdentityVerifier(api, spiffeId, () => now);
  const identity = await verifier.verifyCurrentProcessIdentity();
  assert.equal(identity.spiffeId, spiffeId);
  assert.equal(identity.trustDomain, "eper.example");
  assert.equal(identity.audience, CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE);
  assert.equal(identity.tokenId, "svid-token-123");
  assert.deepEqual(api.calls[0], ["fetch", {
    audience: [CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE], spiffeId,
  }]);
  assert.deepEqual(api.calls[1], ["validate", {
    audience: CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE, tokenPresent: true,
  }]);
  assert.equal(JSON.stringify(identity).includes("opaque-jwt-svid-token"), false);
});

test("SPIFFE verifier accepts the three claims required by the JWT-SVID standard", async () => {
  const standardClaims = {
    sub: spiffeId,
    aud: [CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE],
    exp: Math.floor(now / 1000) + 120,
  };
  const verifier = new CustomerAssetScanChildSpiffeIdentityVerifier(
    client({ validated: { spiffeId, claims: standardClaims } }), spiffeId, () => now,
  );
  const identity = await verifier.verifyCurrentProcessIdentity();
  assert.equal(identity.spiffeId, spiffeId);
  assert.equal(identity.trustDomain, "eper.example");
  assert.equal(identity.expiresAt, standardClaims.exp);
  assert.equal("issuedAt" in identity, false);
  assert.equal("tokenId" in identity, false);
});

test("SPIFFE verifier rejects an unexpected or ambiguous fetched identity", async () => {
  for (const fetched of [
    [],
    [{ spiffeId: "spiffe://eper.example/other", svid: "opaque-jwt-svid-token" }],
    [
      { spiffeId, svid: "opaque-jwt-svid-token" },
      { spiffeId, svid: "opaque-jwt-svid-token-2" },
    ],
    [{ spiffeId, svid: "short" }],
  ]) {
    const verifier = new CustomerAssetScanChildSpiffeIdentityVerifier(
      client({ fetched }), spiffeId, () => now,
    );
    await assert.rejects(verifier.verifyCurrentProcessIdentity(), {
      code: "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_INVALID",
    });
  }
});

test("SPIFFE verifier rejects a validated subject mismatch or wrong audience", async () => {
  for (const validated of [
    { spiffeId: "spiffe://eper.example/other", claims: claims() },
    { spiffeId, claims: claims({ sub: "spiffe://eper.example/other" }) },
    { spiffeId, claims: claims({ aud: ["different-audience"] }) },
  ]) {
    const verifier = new CustomerAssetScanChildSpiffeIdentityVerifier(
      client({ validated }), spiffeId, () => now,
    );
    await assert.rejects(verifier.verifyCurrentProcessIdentity(), {
      code: "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_INVALID",
    });
  }
});

test("SPIFFE verifier rejects expired, future-issued, overlong, or incomplete SVID claims", async () => {
  for (const override of [
    { exp: Math.floor(now / 1000) - 1 },
    { iat: Math.floor(now / 1000) + 60 },
    { exp: Math.floor(now / 1000) + 600 },
    { exp: undefined },
  ]) {
    const verifier = new CustomerAssetScanChildSpiffeIdentityVerifier(
      client({ validated: { spiffeId, claims: claims(override) } }), spiffeId, () => now,
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
