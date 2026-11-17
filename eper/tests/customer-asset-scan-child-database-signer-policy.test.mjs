import test from "node:test";
import assert from "node:assert/strict";
import {
  CustomerAssetScanChildDatabaseSignerPolicy,
} from "../dist/packages/assets/customer-asset-scan-child-database-signer-policy.js";

const now = 1_800_000_000;
const audience = "eper:customer-asset-scan-child";
const spiffeId = "spiffe://eper.example/asset-scanner/child";
const token = "fixture.jwt.svid-value-with-sufficient-length";
const csrPem = `-----BEGIN CERTIFICATE REQUEST-----
${"A".repeat(96)}
-----END CERTIFICATE REQUEST-----`;
const certificatePem = `-----BEGIN CERTIFICATE-----
${"B".repeat(96)}
-----END CERTIFICATE-----`;

function setup({ validated = { spiffeId, claims: { exp: now + 60, aud: [audience] } } } = {}) {
  const validations = [];
  const signatures = [];
  const signer = new CustomerAssetScanChildDatabaseSignerPolicy({
    expectedAudience: audience,
    roleBySpiffeId: new Map([[spiffeId, "eper_scan_child_ci"]]),
    maximumLifetimeSeconds: 120,
  }, {
    async validateJwt(actualAudience, actualToken) {
      validations.push({ audience: actualAudience, token: actualToken });
      return validated;
    },
  }, {
    async sign(input) {
      signatures.push(input);
      return certificatePem;
    },
  }, () => now);
  return { signer, validations, signatures };
}

test("signer independently validates JWT-SVID and derives role and expiry from its own policy", async () => {
  const { signer, validations, signatures } = setup();
  const result = await signer.sign({ csrPem, workloadJwtSvid: token });
  assert.equal(result, certificatePem);
  assert.deepEqual(validations, [{ audience, token }]);
  assert.deepEqual(signatures, [{
    csrPem,
    databaseRole: "eper_scan_child_ci",
    notAfterEpochSeconds: now + 60,
  }]);
});

test("signer caps certificate lifetime at its own maximum when SVID lives longer", async () => {
  const { signer, signatures } = setup({
    validated: { spiffeId, claims: { exp: now + 900, aud: [audience] } },
  });
  await signer.sign({ csrPem, workloadJwtSvid: token });
  assert.equal(signatures[0].notAfterEpochSeconds, now + 120);
});

test("signer fails closed for invalid token or untrusted identity", async () => {
  for (const validated of [
    null,
    { spiffeId: "spiffe://eper.example/other", claims: { exp: now + 60 } },
  ]) {
    const { signer, signatures } = setup({ validated });
    await assert.rejects(() => signer.sign({ csrPem, workloadJwtSvid: token }), {
      code: "CUSTOMER_ASSET_SCAN_CHILD_SIGNER_DENIED",
    });
    assert.equal(signatures.length, 0);
  }
});

test("signer rejects missing, malformed and expired exp claims", async () => {
  for (const claims of [{}, { exp: now - 1 }, { exp: "later" }, { exp: now + 1.5 }]) {
    const { signer, signatures } = setup({ validated: { spiffeId, claims } });
    await assert.rejects(() => signer.sign({ csrPem, workloadJwtSvid: token }), {
      code: "CUSTOMER_ASSET_SCAN_CHILD_SIGNER_DENIED",
    });
    assert.equal(signatures.length, 0);
  }
});

test("signer rejects malformed CSR and malformed JWT-SVID before validation", async () => {
  const { signer, validations, signatures } = setup();
  await assert.rejects(() => signer.sign({ csrPem: "bad", workloadJwtSvid: token }), {
    code: "CUSTOMER_ASSET_SCAN_CHILD_SIGNER_DENIED",
  });
  await assert.rejects(() => signer.sign({ csrPem, workloadJwtSvid: "bad" }), {
    code: "CUSTOMER_ASSET_SCAN_CHILD_SIGNER_DENIED",
  });
  assert.equal(validations.length, 0);
  assert.equal(signatures.length, 0);
});

test("signer rejects invalid CA output and hides internal errors", async () => {
  const broken = new CustomerAssetScanChildDatabaseSignerPolicy({
    expectedAudience: audience,
    roleBySpiffeId: new Map([[spiffeId, "eper_scan_child_ci"]]),
  }, {
    async validateJwt() { return { spiffeId, claims: { exp: now + 60 } }; },
  }, {
    async sign() { throw new Error("private CA diagnostic"); },
  }, () => now);
  await assert.rejects(() => broken.sign({ csrPem, workloadJwtSvid: token }), error =>
    error.code === "CUSTOMER_ASSET_SCAN_CHILD_SIGNER_DENIED" &&
    !error.message.includes("private CA diagnostic"));
});
