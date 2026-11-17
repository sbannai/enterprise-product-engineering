import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const execFile = promisify(execFileCallback);
const require = createRequire("/sdk/package.json");
const sdkEntry = require.resolve("@jeengbe/spiffe");
const { SpiffeClient } = await import(pathToFileURL(sdkEntry).href);
const {
  createCustomerAssetScanChildSignerSpiffeSdkRuntime,
} = await import("/eper/dist/packages/assets/customer-asset-scan-child-database-signer-spiffe-adapter.js");
const {
  CustomerAssetScanChildDatabaseSignerPolicy,
} = await import("/eper/dist/packages/assets/customer-asset-scan-child-database-signer-policy.js");
const {
  listenCustomerAssetScanChildSignerUnixSocket,
} = await import("/eper/dist/packages/assets/customer-asset-scan-child-database-signer-unix-socket.js");

const signerId = "spiffe://example.org/ns/scanner/sa/customer-asset-scan-signer";
const scannerId = "spiffe://example.org/ns/scanner/sa/customer-asset-scan-child";
const audience = "eper:customer-asset-scan-child";
const ipc = "/signer-ipc";
const socketPath = join(ipc, "signer.sock");
const caKey = join(ipc, "ca.key");
const caCert = join(ipc, "ca.crt");
const index = join(ipc, "index.txt");
const serial = join(ipc, "serial");
const newCerts = join(ipc, "newcerts");
const config = join(ipc, "ca.cnf");
const ext = join(ipc, "client.ext");

function opensslTime(epochSeconds) {
  return new Date(epochSeconds * 1000).toISOString().slice(2).replace(/[-:T]/g, "").replace(/\.\d{3}Z$/, "Z");
}

await mkdir(newCerts, { recursive: true });
await chmod(ipc, 0o770);
await writeFile(index, "", { mode: 0o660 });
await writeFile(serial, "01\n", { mode: 0o660 });
await writeFile(ext, "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=clientAuth\n", { mode: 0o660 });
await writeFile(config, [
  "[ ca ]", "default_ca = CA_default", "[ CA_default ]",
  "dir = " + ipc, "database = " + index, "new_certs_dir = " + newCerts,
  "certificate = " + caCert, "private_key = " + caKey, "serial = " + serial,
  "default_md = sha256", "default_days = 1", "default_crl_days = 1",
  "policy = policy_any", "unique_subject = no", "copy_extensions = none",
  "[ policy_any ]", "commonName = supplied", "[ client ]",
  "basicConstraints = critical,CA:FALSE", "keyUsage = critical,digitalSignature",
  "extendedKeyUsage = clientAuth", "",
].join("\n"), { mode: 0o660 });
await execFile("openssl", [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256",
  "-keyout", caKey, "-out", caCert, "-days", "1",
  "-subj", "/CN=EPER separate signer fixture CA",
  "-addext", "basicConstraints=critical,CA:TRUE",
  "-addext", "keyUsage=critical,keyCertSign,cRLSign",
], { timeout: 20_000, maxBuffer: 16_384 });
await chmod(caKey, 0o600);

const runtime = createCustomerAssetScanChildSignerSpiffeSdkRuntime({
  endpoint: "unix:///run/spire/agent/public/api.sock",
  SpiffeClient,
});
const ownSdk = new SpiffeClient({
  connection: "unix:///run/spire/agent/public/api.sock",
  retry: { enabled: false },
});
let listener;
try {
  const ownSvid = await ownSdk.getJwtSvid(audience, { spiffeId: signerId });
  assert.equal(ownSvid.spiffeId, signerId);
  const ownValidation = await runtime.validator.validateJwt(audience, ownSvid.token);
  assert.equal(ownValidation?.spiffeId, signerId);
  assert.ok(ownValidation.claims.exp > Math.floor(Date.now() / 1000));

  const policy = new CustomerAssetScanChildDatabaseSignerPolicy({
    expectedAudience: audience,
    roleBySpiffeId: new Map([[scannerId, "eper_fixture_scanner"]]),
    maximumLifetimeSeconds: 120,
  }, runtime.validator, {
    async sign(input) {
      const requestPath = join(ipc, "request.csr");
      const certificatePath = join(ipc, "issued.crt");
      await writeFile(requestPath, input.csrPem, { mode: 0o600 });
      await execFile("openssl", [
        "req", "-inform", "PEM", "-in", requestPath, "-noout", "-verify",
      ], { timeout: 10_000, maxBuffer: 16_384 });
      const now = Math.floor(Date.now() / 1000);
      await execFile("openssl", [
        "ca", "-batch", "-notext", "-config", config,
        "-in", requestPath, "-out", certificatePath,
        "-startdate", opensslTime(now - 5),
        "-enddate", opensslTime(input.notAfterEpochSeconds),
        "-subj", "/CN=" + input.databaseRole,
        "-extensions", "client",
      ], { timeout: 10_000, maxBuffer: 16_384 });
      return readFile(certificatePath, "utf8");
    },
  });
  listener = await listenCustomerAssetScanChildSignerUnixSocket({
    socketPath,
    signer: policy,
    timeoutMs: 10_000,
  });
  console.log("PASS: separate signer process validated its own SPIRE identity and is listening");
  await new Promise(resolve => process.once("SIGTERM", resolve));
} finally {
  await listener?.close();
  await ownSdk.close();
  await runtime.close();
}
