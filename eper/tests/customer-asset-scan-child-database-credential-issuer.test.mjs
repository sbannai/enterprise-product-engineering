import test from "node:test";
import assert from "node:assert/strict";
import {
  CustomerAssetScanChildDatabaseCredentialIssuer,
} from "../dist/packages/assets/customer-asset-scan-child-database-credential-issuer.js";
import {
  CustomerAssetScanChildSpiffeIdentityVerifier,
} from "../dist/packages/assets/customer-asset-scan-child-spiffe-identity.js";

const now = 1_800_000_000;
const spiffeId = "spiffe://eper.example/asset-scanner/child";
const csrPem = `-----BEGIN CERTIFICATE REQUEST-----
${"A".repeat(96)}
-----END CERTIFICATE REQUEST-----`;
const jwtSvid = "fixture.jwt.svid-value-with-sufficient-length";
const certificatePem = `-----BEGIN CERTIFICATE-----
${"B".repeat(96)}
-----END CERTIFICATE-----`;

async function verifiedIdentity(identity = spiffeId) {
  return new CustomerAssetScanChildSpiffeIdentityVerifier({
    async fetchJwtSvid() {
      return [{ spiffeId: identity, expiresAtMs: (now + 60) * 1000, token: jwtSvid }];
    },
  }, identity, () => now * 1000).verifyCurrentProcessIdentity();
}

test("credential issuer maps verified workload identity to a fixed DB role", async () => {
  const calls = [];
  const issuer = new CustomerAssetScanChildDatabaseCredentialIssuer(
    new Map([[spiffeId, "eper_scan_child_ci"]]),
    { async sign(input) { calls.push(input); return certificatePem; } },
    90,
    () => now,
  );
  const workload = await verifiedIdentity();
  const credential = await issuer.issue({ workload, csrPem });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].csrPem, csrPem);
  assert.equal(calls[0].workloadJwtSvid, jwtSvid);
  assert.deepEqual(credential, {
    databaseRole: "eper_scan_child_ci",
    clientCertificatePem: certificatePem,
    expiresAt: now + 60,
  });
  assert.equal(Object.isFrozen(credential), true);
});

test("issuer selects the fixed database role separately from untrusted CSR subject bytes", async () => {
  const calls = [];
  const attackerCsr = `-----BEGIN CERTIFICATE REQUEST-----
${"C".repeat(96)}
-----END CERTIFICATE REQUEST-----
subject=CN=postgres_superuser`;
  const issuer = new CustomerAssetScanChildDatabaseCredentialIssuer(
    new Map([[spiffeId, "eper_scan_child_ci"]]),
    { async sign(input) { calls.push(input); return certificatePem; } },
    90,
    () => now,
  );
  await issuer.issue({ workload: await verifiedIdentity(), csrPem: attackerCsr });
  assert.equal(calls[0].csrPem, attackerCsr);
  assert.equal(calls[0].workloadJwtSvid, jwtSvid);
});

test("issuer rejects unverified and non-entitled identities without invoking signer", async () => {
  let signerCalls = 0;
  const issuer = new CustomerAssetScanChildDatabaseCredentialIssuer(
    new Map([[spiffeId, "eper_scan_child_ci"]]),
    { async sign() { signerCalls += 1; return certificatePem; } },
    90,
    () => now,
  );
  await assert.rejects(() => issuer.issue({
    workload: { spiffeId, trustDomain: "eper.example", audience: "eper:customer-asset-scan-child", expiresAt: now + 60 },
    csrPem,
  }), { code: "CUSTOMER_ASSET_SCAN_CHILD_CREDENTIAL_ISSUANCE_UNAVAILABLE" });
  const unentitled = await verifiedIdentity("spiffe://eper.example/unentitled/child");
  await assert.rejects(() => issuer.issue({
    workload: unentitled,
    csrPem,
  }), { code: "CUSTOMER_ASSET_SCAN_CHILD_CREDENTIAL_ISSUANCE_UNAVAILABLE" });
  assert.equal(signerCalls, 0);
});

test("issuer rejects malformed CSR, malformed signer output and signer errors", async () => {
  const workload = await verifiedIdentity();
  const issuer = new CustomerAssetScanChildDatabaseCredentialIssuer(
    new Map([[spiffeId, "eper_scan_child_ci"]]),
    { async sign() { return "not a certificate"; } },
    90,
    () => now,
  );
  await assert.rejects(() => issuer.issue({ workload, csrPem: "bad" }), {
    code: "CUSTOMER_ASSET_SCAN_CHILD_CREDENTIAL_ISSUANCE_UNAVAILABLE",
  });
  await assert.rejects(() => issuer.issue({ workload, csrPem }), {
    code: "CUSTOMER_ASSET_SCAN_CHILD_CREDENTIAL_ISSUANCE_UNAVAILABLE",
  });
  const failing = new CustomerAssetScanChildDatabaseCredentialIssuer(
    new Map([[spiffeId, "eper_scan_child_ci"]]),
    { async sign() { throw new Error("CA private diagnostic"); } },
    90,
    () => now,
  );
  await assert.rejects(() => failing.issue({ workload, csrPem }), error =>
    error.code === "CUSTOMER_ASSET_SCAN_CHILD_CREDENTIAL_ISSUANCE_UNAVAILABLE" &&
    !error.message.includes("CA private diagnostic"));
});

test("issuer enforces bounded short-lived certificate policy", () => {
  assert.throws(() => new CustomerAssetScanChildDatabaseCredentialIssuer(
    new Map([[spiffeId, "eper_scan_child_ci"]]),
    { async sign() { return certificatePem; } },
    301,
    () => now,
  ), /CREDENTIAL_POLICY_INVALID/);
  assert.throws(() => new CustomerAssetScanChildDatabaseCredentialIssuer(
    new Map([[spiffeId, "postgres; DROP ROLE"]]),
    { async sign() { return certificatePem; } },
    90,
    () => now,
  ), /CREDENTIAL_POLICY_INVALID/);
});

test("issuer snapshots the allowlisted identity-to-role policy at construction", async () => {
  const policy = new Map([[spiffeId, "eper_scan_child_ci"]]);
  const calls = [];
  const issuer = new CustomerAssetScanChildDatabaseCredentialIssuer(
    policy,
    { async sign(input) { calls.push(input); return certificatePem; } },
    90,
    () => now,
  );
  policy.set(spiffeId, "postgres_superuser");
  await issuer.issue({ workload: await verifiedIdentity(), csrPem });
  assert.equal(calls[0].databaseRole, "eper_scan_child_ci");
});

test("issued database credential never outlives its authorizing workload SVID", async () => {
  let signerCalls = 0;
  const issuer = new CustomerAssetScanChildDatabaseCredentialIssuer(
    new Map([[spiffeId, "eper_scan_child_ci"]]),
    { async sign() { signerCalls += 1; return certificatePem; } },
    90,
    () => now + 61,
  );
  const workload = await verifiedIdentity();
  await assert.rejects(() => issuer.issue({ workload, csrPem }), {
    code: "CUSTOMER_ASSET_SCAN_CHILD_CREDENTIAL_ISSUANCE_UNAVAILABLE",
  });
  assert.equal(signerCalls, 0);
});
