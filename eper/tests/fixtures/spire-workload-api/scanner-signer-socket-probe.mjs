import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
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
let pool;
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
    "verify", "-CAfile", "/fixture/scanner-client-ca.crt", "-purpose", "sslclient", certPath,
  ], { timeout: 10_000, maxBuffer: 16_384 });
  const [details, certKey, csrKey] = await Promise.all([
    execFile("openssl", ["x509", "-in", certPath, "-noout", "-subject", "-enddate", "-ext", "extendedKeyUsage"]),
    execFile("openssl", ["x509", "-in", certPath, "-pubkey", "-noout"]),
    execFile("openssl", ["req", "-in", csrPath, "-pubkey", "-noout"]),
  ]);
  assert.match(details.stdout, /CN\s*=\s*eper_fixture_scanner/);
  assert.match(details.stdout, /TLS Web Client Authentication|clientAuth/);
  assert.equal(certKey.stdout.trim(), csrKey.stdout.trim());

  const host = process.env.PGHOST;
  const port = Number(process.env.PGPORT || "5432");
  const database = process.env.PGDATABASE;
  const user = process.env.PGUSER;
  assert.ok(host && database && user, "PostgreSQL fixture connection configuration required");
  pool = new pg.Pool({
    host, port, database, user, max: 1, connectionTimeoutMillis: 5000,
    ssl: {
      ca: await readFile("/fixture/ca.crt", "utf8"),
      cert: certificatePem,
      key: await readFile(request.privateKeyPath, "utf8"),
      rejectUnauthorized: true,
    },
  });
  const identityResult = await pool.query(
    "SELECT concat_ws('|', session_user, current_user, has_function_privilege(current_user, 'public.eper_resolve_customer_asset_scan_child_context(uuid,bigint)', 'EXECUTE'), has_table_privilege(current_user, 'public.eper_customer_assets', 'SELECT')) AS proof",
  );
  assert.equal(identityResult.rows[0]?.proof, "eper_fixture_scanner|eper_fixture_scanner|true|false");
  const resolver = await pool.query(
    "SELECT count(*)::int AS count FROM public.eper_resolve_customer_asset_scan_child_context($1::uuid, $2::bigint)",
    ["00000000-0000-0000-0000-000000000001", 1],
  );
  assert.equal(resolver.rows[0]?.count, 0);
  console.log("PASS: separate scanner process exchanged CSR/JWT-SVID with signer; signer-issued certificate authenticated PostgreSQL mTLS LOGIN");
  console.log("PASS: session_user mapping and EXECUTE-only resolver boundary verified over the dynamic mTLS connection");
} finally {
  await pool?.end().catch(() => {});
  await request?.cleanup();
  await runtime.close();
}
