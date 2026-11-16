import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createCustomerAssetScanChildEphemeralKeyRequest } from "../dist/packages/assets/customer-asset-scan-child-ephemeral-key.js";

test("scanner child generates a real CSR while retaining the private key locally", async () => {
  const request = await createCustomerAssetScanChildEphemeralKeyRequest();
  try {
    assert.match(request.csrPem, /-----BEGIN CERTIFICATE REQUEST-----/);
    assert.equal(request.csrPem.includes("PRIVATE KEY"), false);
    const metadata = await stat(request.privateKeyPath);
    assert.equal(metadata.mode & 0o777, 0o600);
    const verifier = spawn("openssl", ["req", "-inform", "PEM", "-noout", "-verify"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let errors = "";
    verifier.stdout.setEncoding("utf8").on("data", chunk => { output += chunk; });
    verifier.stderr.setEncoding("utf8").on("data", chunk => { errors += chunk; });
    verifier.stdin.end(request.csrPem);
    const [exitCode] = await once(verifier, "close");
    assert.equal(exitCode, 0, errors);
    assert.match(output + errors, /verify OK/i);
    const key = await readFile(request.privateKeyPath, "utf8");
    assert.match(key, /-----BEGIN PRIVATE KEY-----/);
  } finally {
    const privateKeyPath = request.privateKeyPath;
    await request.cleanup();
    await request.cleanup();
    await assert.rejects(access(privateKeyPath));
  }
});
