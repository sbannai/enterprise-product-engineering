import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { CustomerAssetScanChildUnixSocketCertificateSigner } from "/eper/dist/packages/assets/customer-asset-scan-child-database-signer-unix-socket.js";
import { createCustomerAssetScanChildEphemeralKeyRequest } from "/eper/dist/packages/assets/customer-asset-scan-child-ephemeral-key.js";

const execFile = promisify(execFileCallback);
const require = createRequire("/sdk/package.json");
const { SpiffeClient } = await import(pathToFileURL(require.resolve("@jeengbe/spiffe")).href);
const { createCustomerAssetScanChildSpiffeSdkRuntime } = await import(
  "/eper/dist/packages/assets/customer-asset-scan-child-spiffe-sdk-adapter.js"
);
const { CustomerAssetScanChildSpiffeIdentityVerifier } = await import(
  "/eper/dist/packages/assets/customer-asset-scan-child-spiffe-identity.js"
);
const expectedId = "spiffe://example.org/ns/scanner/sa/customer-asset-scan-child";
const audience = "eper:customer-asset-scan-child";
const runtime = createCustomerAssetScanChildSpiffeSdkRuntime({
  endpoint: "unix:///run/spire/agent/public/api.sock",
  SpiffeClient,
});
let request;
try {
  const identity = await new CustomerAssetScanChildSpiffeIdentityVerifier(
    runtime.adapter, expectedId,
  ).verifyCurrentProcessIdentity(AbortSignal.timeout(10_000));
  assert.equal(identity.spiffeId, expectedId);
  const svids = await runtime.adapter.fetchJwtSvid({
    audience: [audience],
    spiffeId: expectedId,
  });
  assert.equal(svids.length, 1);
  request = await createCustomerAssetScanChildEphemeralKeyRequest();
  const signer = new CustomerAssetScanChildUnixSocketCertificateSigner({
    socketPath: "/signer-ipc/signer.sock",
    timeoutMs: 10_000,
  });
  const certificatePem = await signer.sign({
    csrPem: request.csrPem,
    workloadJwtSvid: svids[0].token,
  });
  const certPath = "/tmp/issued-scanner-client.crt";
  const csrPath = "/tmp/scanner-client.csr";
  await Promise.all([
    writeFile(certPath, certificatePem, { mode: 0o600 }),
    writeFile(csrPath, request.csrPem, { mode: 0o600 }),
  ]);
  await execFile("openssl", [
    "verify", "-CAfile", "/signer-ipc/ca.crt", "-purpose", "sslclient", certPath,
  ], { timeout: 10_000, maxBuffer: 16_384 });
  const [details, certKey, csrKey] = await Promise.all([
    execFile("openssl", ["x509", "-in", certPath, "-noout", "-subject", "-enddate", "-ext", "extendedKeyUsage"]),
    execFile("openssl", ["x509", "-in", certPath, "-pubkey", "-noout"]),
    execFile("openssl", ["req", "-in", csrPath, "-pubkey", "-noout"]),
  ]);
  assert.match(details.stdout, /CN\s*=\s*eper_fixture_scanner/);
  assert.match(details.stdout, /TLS Web Client Authentication|clientAuth/);
  assert.equal(certKey.stdout.trim(), csrKey.stdout.trim());
  console.log("PASS: separate scanner process exchanged CSR and JWT-SVID with signer process; certificate chain, subject, EKU and public-key binding verified");
} finally {
  await request?.cleanup();
  await runtime.close();
}
