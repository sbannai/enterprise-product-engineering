import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { runCustomerAssetScanChild } from "../dist/packages/assets/customer-asset-scan-child-supervisor.js";

const start = () => ({
  version: 3, type: "start", jobToken: "e".repeat(64), claimGeneration: 17,
  requestId: "process-e2e-request", workerId: "scanner.test.v1:worker",
  scannerServiceId: "scanner.test.v1",
  input: {
    tenantId: "tenant-e2e", applicationId: "application-e2e",
    assetId: "11111111-1111-4111-8111-111111111111",
    checksumSha256: "b".repeat(64), sizeBytes: 4, mimeType: "application/pdf",
  },
});

const childBootstrap = (consumeAll) => `
import { runCustomerAssetScanChildStdio } from "./dist/packages/assets/customer-asset-scan-child-stdio.js";
import { CustomerAssetScanChildRuntime } from "./dist/packages/assets/customer-asset-scan-child-runtime.js";
const context = {
  tenantId: "tenant-e2e", applicationId: "application-e2e",
  workerId: "scanner.test.v1:worker", scannerServiceId: "scanner.test.v1",
  assetId: "11111111-1111-4111-8111-111111111111",
  storageAdapterKey: "test.storage", providerObjectReference: "opaque-object-ref",
  providerUploadReference: "opaque-upload-ref", checksumSha256: "${"b".repeat(64)}",
  sizeBytes: 4, mimeType: "application/pdf", attempt: 1, providerConnectionId: "connection-e2e",
};
const runtime = new CustomerAssetScanChildRuntime({
  identity: { async verifyCurrentProcessIdentity() {
    return { spiffeId: "spiffe://test.local/scanner", trustDomain: "test.local",
      audience: "eper:customer-asset-scan-child", expiresAt: 9999999999 };
  } },
  input: { async resolve() { return context; } },
  provider: { async dispatch(input) {
    if (input.operation.kind !== "read_object_internal" ||
        input.expectedConnectionId !== "connection-e2e") throw new Error("scope mismatch");
    return { async *[Symbol.asyncIterator]() { yield new Uint8Array([1,2]); yield new Uint8Array([3,4]); } };
  } },
  scanner: { async scan(input) {
    ${consumeAll ? "for await (const chunk of input.source) void chunk;" : "const iterator = input.source[Symbol.asyncIterator](); await iterator.next();"}
    return { scanStatus: "clean" };
  } },
});
const code = await runCustomerAssetScanChildStdio({
  stdin: process.stdin, stdout: process.stdout, runtime, signal: new AbortController().signal,
});
process.exitCode = code;
`;

test("parent supervisor completes the full child runtime over real process IPC", async () => {
  const outcome = await runCustomerAssetScanChild({
    executable: process.execPath,
    args: ["--input-type=module", "-e", childBootstrap(true)],
    start: start(),
    timeoutMs: 5_000,
    environment: {},
  });
  assert.equal(outcome.kind, "result");
  assert.equal(outcome.value.scanStatus, "clean");
  assert.equal(outcome.value.claimGeneration, 17);
});

test("parent supervisor receives a fail-closed result when child scanner does not exhaust object stream", async () => {
  const outcome = await runCustomerAssetScanChild({
    executable: process.execPath,
    args: ["--input-type=module", "-e", childBootstrap(false)],
    start: start(),
    timeoutMs: 5_000,
    environment: {},
  });
  assert.equal(outcome.kind, "failure");
  assert.equal(outcome.value.code, "SCANNER_RESULT_INVALID");
});

test("child bootstrap failures remain on protocol stdout after diagnostic output is redirected", () => {
  const child = spawnSync(process.execPath, ["dist/apps/worker/customer-asset-scan-child-main.js"], {
    input: "{}",
    encoding: "utf8",
    env: process.env,
    timeout: 5_000,
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 1);
  const response = JSON.parse(child.stdout.trim());
  assert.equal(response.type, "failure");
  assert.equal(response.code, "SCANNER_BOOTSTRAP_FAILED");
  assert.equal(child.stderr.includes('"type":"failure"'), false);
});

test("child bootstrap returns a structured failure for malformed IPC input", () => {
  const child = spawnSync(process.execPath, ["dist/apps/worker/customer-asset-scan-child-main.js"], {
    input: "{",
    encoding: "utf8",
    env: process.env,
    timeout: 5_000,
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 1);
  const response = JSON.parse(child.stdout.trim());
  assert.equal(response.type, "failure");
  assert.equal(response.code, "SCANNER_BOOTSTRAP_FAILED");
  assert.equal(child.stderr.includes('"type":"failure"'), false);
});

test("child bootstrap returns a structured failure when IPC exceeds the byte limit", () => {
  const child = spawnSync(process.execPath, ["dist/apps/worker/customer-asset-scan-child-main.js"], {
    input: "x".repeat(16_385),
    encoding: "utf8",
    env: process.env,
    timeout: 5_000,
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 1);
  const response = JSON.parse(child.stdout.trim());
  assert.equal(response.type, "failure");
  assert.equal(response.code, "SCANNER_BOOTSTRAP_FAILED");
  assert.equal(child.stderr.includes('"type":"failure"'), false);
});
