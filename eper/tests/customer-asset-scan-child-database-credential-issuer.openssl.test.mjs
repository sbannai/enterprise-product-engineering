import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
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

test("OpenSSL test signer verifies CSR, overrides its subject with the allowlisted DB role and issues clientAuth certificate", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eper-child-issuer-test-"));
  const request = await createCustomerAssetScanChildEphemeralKeyRequest();
  try {
    const caKey = join(directory, "ca.key");
    const caCert = join(directory, "ca.crt");
    const csrPath = join(directory, "child.csr");
    const certPath = join(directory, "child.crt");
    const extensions = join(directory, "client.ext");
    await execFile("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256",
      "-keyout", caKey, "-out", caCert, "-days", "2",
      "-subj", "/CN=EPER isolated test CA",
    ], { timeout: 20_000, maxBuffer: 16_384 });
    await writeFile(csrPath, request.csrPem, { mode: 0o600 });
    await writeFile(extensions, "[client]\nextendedKeyUsage=clientAuth\nkeyUsage=digitalSignature\n", { mode: 0o600 });

    const workload = await new CustomerAssetScanChildSpiffeIdentityVerifier({
      async fetchJwtSvid() {
        return [{ spiffeId, expiresAtMs: (now + 120) * 1000 }];
      },
    }, spiffeId, () => now * 1000).verifyCurrentProcessIdentity();

    const issuer = new CustomerAssetScanChildDatabaseCredentialIssuer(
      new Map([[spiffeId, "eper_scan_child_ci"]]),
      {
        async sign(input) {
          assert.equal(input.databaseRole, "eper_scan_child_ci");
          assert.equal(input.notAfterEpochSeconds, now + 120);
          await writeFile(csrPath, input.csrPem, { mode: 0o600 });
          await execFile("openssl", [
            "req", "-inform", "PEM", "-in", csrPath, "-noout", "-verify",
          ], { timeout: 10_000, maxBuffer: 16_384 });
          await execFile("openssl", [
            "x509", "-req", "-in", csrPath, "-CA", caCert, "-CAkey", caKey,
            "-set_serial", "7", "-days", "1", "-sha256",
            "-subj", "/CN=" + input.databaseRole,
            "-extfile", extensions, "-extensions", "client",
            "-out", certPath,
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
      "x509", "-in", certPath, "-noout", "-subject", "-ext", "extendedKeyUsage",
    ], { timeout: 10_000, maxBuffer: 16_384 });
    assert.match(details.stdout, /CN\s*=\s*eper_scan_child_ci/);
    assert.match(details.stdout, /TLS Web Client Authentication|clientAuth/);
    assert.equal(credential.databaseRole, "eper_scan_child_ci");
    assert.equal(credential.clientCertificatePem, await readFile(certPath, "utf8"));
    assert.equal(credential.expiresAt, now + 120);
  } finally {
    await request.cleanup();
    await rm(directory, { recursive: true, force: true });
  }
});
