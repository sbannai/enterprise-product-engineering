import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import {
  CustomerAssetScanChildDatabaseCredentialIssuer,
} from "../dist/packages/assets/customer-asset-scan-child-database-credential-issuer.js";
import {
  CustomerAssetScanChildSpiffeIdentityVerifier,
} from "../dist/packages/assets/customer-asset-scan-child-spiffe-identity.js";
import {
  createCustomerAssetScanChildEphemeralKeyRequest,
} from "../dist/packages/assets/customer-asset-scan-child-ephemeral-key.js";

const execFile = promisify(execFileCallback);
const now = Math.floor(Date.now() / 1000);
const spiffeId = "spiffe://eper.example/asset-scanner/child";

function opensslTime(epochSeconds) {
  return new Date(epochSeconds * 1000).toISOString().slice(2).replace(/[-:T]/g, "").replace(/\.\d{3}Z$/, "Z");
}

test("OpenSSL test signer verifies CSR, overrides its subject, enforces notAfter and issues clientAuth certificate", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eper-child-issuer-test-"));
  const request = await createCustomerAssetScanChildEphemeralKeyRequest();
  try {
    const caKey = join(directory, "ca.key");
    const caCert = join(directory, "ca.crt");
    const csrPath = join(directory, "child.csr");
    const certPath = join(directory, "child.crt");
    const newCerts = join(directory, "newcerts");
    const index = join(directory, "index.txt");
    const serial = join(directory, "serial");
    const config = join(directory, "ca.cnf");
    await mkdir(newCerts);
    await writeFile(index, "", { mode: 0o600 });
    await writeFile(serial, "01\n", { mode: 0o600 });
    await execFile("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256",
      "-keyout", caKey, "-out", caCert, "-days", "2",
      "-subj", "/CN=EPER isolated test CA",
    ], { timeout: 20_000, maxBuffer: 16_384 });
    await writeFile(csrPath, request.csrPem, { mode: 0o600 });
    await writeFile(config, [
      "[ ca ]",
      "default_ca = CA_default",
      "[ CA_default ]",
      "dir = " + directory,
      "database = " + index,
      "new_certs_dir = " + newCerts,
      "certificate = " + caCert,
      "private_key = " + caKey,
      "serial = " + serial,
      "default_md = sha256",
      "default_days = 1",
      "default_crl_days = 1",
      "policy = policy_any",
      "unique_subject = no",
      "copy_extensions = none",
      "[ policy_any ]",
      "commonName = supplied",
      "[ client ]",
      "basicConstraints = critical,CA:FALSE",
      "keyUsage = critical,digitalSignature",
      "extendedKeyUsage = clientAuth",
      "",
    ].join("\n"), { mode: 0o600 });

    const workload = await new CustomerAssetScanChildSpiffeIdentityVerifier({
      async fetchJwtSvid() {
        return [{ spiffeId, expiresAtMs: (now + 120) * 1000, jwtSvid: "fixture-workload-jwt-svid-value" }];
      },
    }, spiffeId, () => now * 1000).verifyCurrentProcessIdentity();

    const issuer = new CustomerAssetScanChildDatabaseCredentialIssuer(
      new Map([[spiffeId, "eper_scan_child_ci"]]),
      {
        async sign(input) {
          assert.equal(input.workloadJwtSvid, "fixture-workload-jwt-svid-value");
          const databaseRole = "eper_scan_child_ci";
          const notAfterEpochSeconds = now + 120;
          await writeFile(csrPath, input.csrPem, { mode: 0o600 });
          await execFile("openssl", [
            "req", "-inform", "PEM", "-in", csrPath, "-noout", "-verify",
          ], { timeout: 10_000, maxBuffer: 16_384 });
          await execFile("openssl", [
            "ca", "-batch", "-notext", "-config", config,
            "-in", csrPath, "-out", certPath,
            "-startdate", opensslTime(now - 5),
            "-enddate", opensslTime(notAfterEpochSeconds),
            "-subj", "/CN=" + databaseRole,
            "-extensions", "client",
          ], { timeout: 10_000, maxBuffer: 16_384 });
          return readFile(certPath, "utf8");
        },
      },
      120,
      () => now,
    );

    const credential = await issuer.issue({ workload, csrPem: request.csrPem });
    await execFile("openssl", [
      "verify", "-CAfile", caCert, "-purpose", "sslclient", certPath,
    ], { timeout: 10_000, maxBuffer: 16_384 });
    const details = await execFile("openssl", [
      "x509", "-in", certPath, "-noout", "-subject", "-enddate", "-ext", "extendedKeyUsage",
    ], { timeout: 10_000, maxBuffer: 16_384 });
    assert.match(details.stdout, /CN\s*=\s*eper_scan_child_ci/);
    assert.match(details.stdout, /TLS Web Client Authentication|clientAuth/);
    const certificateExpiry = Date.parse(details.stdout.match(/notAfter=(.+)/)?.[1] ?? "") / 1000;
    assert.equal(certificateExpiry, now + 120);
    assert.equal(credential.databaseRole, "eper_scan_child_ci");
    assert.equal(credential.clientCertificatePem, await readFile(certPath, "utf8"));
    assert.equal(credential.expiresAt, now + 120);

    const invalidCsr = request.csrPem.replace(/\n([A-Za-z0-9+/])/, (_, character) =>
      "\n" + (character === "A" ? "B" : "A"));
    await assert.rejects(() => issuer.issue({ workload, csrPem: invalidCsr }), {
      code: "CUSTOMER_ASSET_SCAN_CHILD_CREDENTIAL_ISSUANCE_UNAVAILABLE",
    });
  } finally {
    await request.cleanup();
    await rm(directory, { recursive: true, force: true });
  }
});
