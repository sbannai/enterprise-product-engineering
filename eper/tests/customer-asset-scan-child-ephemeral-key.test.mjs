import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createCustomerAssetScanChildEphemeralKeyRequest } from "../dist/packages/assets/customer-asset-scan-child-ephemeral-key.js";

const run = promisify(execFile);

test("scanner child generates a real CSR while retaining the private key locally", async () => {
  const request = await createCustomerAssetScanChildEphemeralKeyRequest();
  try {
    assert.match(request.csrPem, /-----BEGIN CERTIFICATE REQUEST-----/);
    assert.equal(request.csrPem.includes("PRIVATE KEY"), false);
    const metadata = await stat(request.privateKeyPath);
    assert.equal(metadata.mode & 0o777, 0o600);
    const { stdout } = await run("openssl", ["req", "-in", "/dev/stdin", "-noout", "-verify"], {
      input: request.csrPem,
      timeout: 10_000,
    });
    assert.match(stdout, /verify OK/i);
    const key = await readFile(request.privateKeyPath, "utf8");
    assert.match(key, /-----BEGIN PRIVATE KEY-----/);
  } finally {
    const privateKeyPath = request.privateKeyPath;
    await request.cleanup();
    await request.cleanup();
    await assert.rejects(access(privateKeyPath));
  }
});
