import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";
import {
  CustomerAssetScanChildUnixSocketCertificateSigner,
  listenCustomerAssetScanChildSignerUnixSocket,
} from "../dist/packages/assets/customer-asset-scan-child-database-signer-unix-socket.js";

const certificatePem = `-----BEGIN CERTIFICATE-----
${"B".repeat(96)}
-----END CERTIFICATE-----`;
const csrPem = `-----BEGIN CERTIFICATE REQUEST-----
${"A".repeat(96)}
-----END CERTIFICATE REQUEST-----`;
const token = "opaque.jwt-svid-value-that-is-long-enough";

async function fixture(t, signer) {
  const directory = await mkdtemp(join(tmpdir(), "eper-signer-socket-"));
  const socketPath = join(directory, "signer.sock");
  const server = await listenCustomerAssetScanChildSignerUnixSocket({ socketPath, signer });
  t.after(async () => {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { socketPath, directory };
}

test("scanner sends only CSR and opaque SVID over signer Unix socket", async t => {
  let received;
  const { socketPath, directory } = await fixture(t, {
    async sign(input) { received = input; return certificatePem; },
  });
  const metadata = await stat(socketPath);
  assert.equal(metadata.mode & 0o777, 0o660);
  const client = new CustomerAssetScanChildUnixSocketCertificateSigner({ socketPath });
  assert.equal(await client.sign({ csrPem, workloadJwtSvid: token }), certificatePem);
  assert.deepEqual(received, { csrPem, workloadJwtSvid: token });
  assert.deepEqual(Object.keys(received).sort(), ["csrPem", "workloadJwtSvid"]);
  assert.equal((await readFile(directory + "/signer.sock").catch(() => Buffer.from(""))).length, 0);
});

test("signer failures return a generic denial without leaking CA diagnostics", async t => {
  const { socketPath } = await fixture(t, {
    async sign() { throw new Error("private CA key path leaked"); },
  });
  const client = new CustomerAssetScanChildUnixSocketCertificateSigner({ socketPath });
  await assert.rejects(() => client.sign({ csrPem, workloadJwtSvid: token }), {
    message: "CUSTOMER_ASSET_SCAN_CHILD_SIGNER_DENIED",
  });
});

test("scanner client rejects invalid socket paths and oversized requests", async () => {
  assert.throws(() => new CustomerAssetScanChildUnixSocketCertificateSigner({
    socketPath: "/tmp/../unsafe.sock",
  }), { message: "CUSTOMER_ASSET_SCAN_CHILD_SIGNER_SOCKET_INVALID" });
  const client = new CustomerAssetScanChildUnixSocketCertificateSigner({
    socketPath: "/tmp/eper-unused.sock",
  });
  await assert.rejects(() => client.sign({
    csrPem: "x".repeat(100_000),
    workloadJwtSvid: token,
  }), { message: "CUSTOMER_ASSET_SCAN_CHILD_SIGNER_REQUEST_TOO_LARGE" });
});

test("signer listener rejects requests with caller-supplied role or expiry", async t => {
  const { socketPath } = await fixture(t, {
    async sign() { assert.fail("unexpected signer invocation"); },
  });
  const response = await new Promise(resolve => {
    const socket = createConnection(socketPath);
    let value = "";
    socket.on("data", chunk => { value += chunk.toString(); });
    socket.on("end", () => resolve(value));
    socket.on("connect", () => socket.end(JSON.stringify({
      csrPem, workloadJwtSvid: token, databaseRole: "postgres", expiresAt: 9999999999,
    }) + "\n"));
  });
  assert.deepEqual(JSON.parse(response), { ok: false, error: "SIGNER_UNAVAILABLE" });
});

import {
  CustomerAssetScanChildDatabaseSignerPolicy,
} from "../dist/packages/assets/customer-asset-scan-child-database-signer-policy.js";

test("Unix socket delegates to signer policy for identity-derived role and SVID-bounded certificate expiry", async t => {
  const expectedSpiffeId = "spiffe://example.org/ns/scanner/sa/customer-asset-scan-child";
  const now = 1_800_000_000;
  let caInput;
  const policy = new CustomerAssetScanChildDatabaseSignerPolicy({
    expectedAudience: "eper:customer-asset-scan-child",
    roleBySpiffeId: new Map([[expectedSpiffeId, "eper_scan_child_ci"]]),
    maximumLifetimeSeconds: 120,
  }, {
    async validateJwt(audience, presentedToken) {
      assert.equal(audience, "eper:customer-asset-scan-child");
      assert.equal(presentedToken, token);
      return { spiffeId: expectedSpiffeId, claims: { exp: now + 75 } };
    },
  }, {
    async sign(input) {
      caInput = input;
      return certificatePem;
    },
  }, () => now);
  const { socketPath } = await fixture(t, policy);
  const client = new CustomerAssetScanChildUnixSocketCertificateSigner({ socketPath });
  assert.equal(await client.sign({ csrPem, workloadJwtSvid: token }), certificatePem);
  assert.deepEqual(caInput, {
    csrPem,
    databaseRole: "eper_scan_child_ci",
    notAfterEpochSeconds: now + 75,
  });
});

test("signer listener processes at most one request per socket while signing is pending", async t => {
  let calls = 0;
  let markCalled;
  let releaseSigner;
  const called = new Promise(resolve => { markCalled = resolve; });
  const pending = new Promise(resolve => { releaseSigner = resolve; });
  const { socketPath } = await fixture(t, {
    async sign() {
      calls += 1;
      markCalled();
      await pending;
      return certificatePem;
    },
  });
  let clientSocket;
  const response = new Promise((resolve, reject) => {
    clientSocket = createConnection(socketPath);
    let value = "";
    clientSocket.once("error", reject);
    clientSocket.on("data", chunk => { value += chunk.toString(); });
    clientSocket.on("end", () => resolve(value));
    clientSocket.once("connect", () => {
      clientSocket.write(JSON.stringify({ csrPem, workloadJwtSvid: token }) + "\n");
    });
  });
  await called;
  // A second frame on the same connection, before signing completes, is ignored.
  clientSocket.write(JSON.stringify({ csrPem, workloadJwtSvid: token }) + "\n");
  releaseSigner();
  const payload = await response;
  assert.equal(JSON.parse(payload).ok, true);
  assert.equal(calls, 1);
});
