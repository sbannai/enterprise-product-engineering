import test from "node:test";
import assert from "node:assert/strict";
import { CustomerAssetScanChildRuntime } from "../dist/packages/assets/customer-asset-scan-child-runtime.js";

const start = () => ({
  version: 3, type: "start", jobToken: "a".repeat(64), claimGeneration: 7,
  requestId: "request-1", workerId: "scanner.synthetic.v1:worker-1", scannerServiceId: "scanner.synthetic.v1",
  input: {
    tenantId: "tenant-1", applicationId: "application-1",
    assetId: "11111111-1111-4111-8111-111111111111",
    checksumSha256: "b".repeat(64), sizeBytes: 4, mimeType: "application/pdf",
  },
});
const context = () => ({
  tenantId: "tenant-1", applicationId: "application-1",
  workerId: "scanner.synthetic.v1:worker-1", scannerServiceId: "scanner.synthetic.v1",
  assetId: "11111111-1111-4111-8111-111111111111",
  storageAdapterKey: "test.storage", providerObjectReference: "opaque-object-reference",
  providerUploadReference: "opaque-upload-reference", checksumSha256: "b".repeat(64),
  sizeBytes: 4, mimeType: "application/pdf", attempt: 1, providerConnectionId: "connection-1",
});
const makeRuntime = ({ stream, scanner, resolvedContext = context(), dispatchError } = {}) => {
  const calls = { identity: 0, input: 0, dispatch: 0, dispatchInput: undefined };
  const runtime = new CustomerAssetScanChildRuntime({
    identity: { async verifyCurrentProcessIdentity() { calls.identity++; return { spiffeId: "spiffe://example.org/eper/scanner", trustDomain: "example.org", audience: "eper:customer-asset-scan-child", expiresAt: 9999999999 }; } },
    input: { async resolve(value) { calls.input++; assert.equal(value.start.type, "start"); return resolvedContext; } },
    provider: { async dispatch(value) { calls.dispatch++; calls.dispatchInput = value; if (dispatchError) throw dispatchError; return stream; } },
    scanner: scanner ?? { async scan(value) { const chunks=[]; for await (const chunk of value.source) chunks.push(...chunk); return { scanStatus: "clean" }; } },
  });
  return { runtime, calls };
};
const signal = () => new AbortController().signal;

test("child runtime authorizes its own workload, resolves provider scope and scans the complete internal stream", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const source = { async *[Symbol.asyncIterator]() { yield bytes; } };
  const { runtime, calls } = makeRuntime({ stream: source });
  const result = await runtime.execute(start(), signal());
  assert.equal(result.type, "result");
  assert.equal(result.scanStatus, "clean");
  assert.equal(result.scannerServiceId, "scanner.synthetic.v1");
  assert.equal(calls.identity, 1);
  assert.equal(calls.input, 1);
  assert.equal(calls.dispatch, 1);
  assert.equal(calls.dispatchInput.expectedConnectionId, "connection-1");
  assert.equal(calls.dispatchInput.operation.kind, "read_object_internal");
  assert.equal(calls.dispatchInput.operation.request.providerObjectReference, "opaque-object-reference");
});

test("child runtime rejects a scanner that returns before exhausting the verified stream", async () => {
  const source = { async *[Symbol.asyncIterator]() { yield new Uint8Array([1, 2, 3, 4]); } };
  const { runtime } = makeRuntime({
    stream: source,
    scanner: { async scan() { return { scanStatus: "clean" }; } },
  });
  const result = await runtime.execute(start(), signal());
  assert.equal(result.type, "failure");
  assert.equal(result.code, "SCANNER_RESULT_INVALID");
});

test("child runtime fails closed when provider authorization or object read fails", async () => {
  const { runtime } = makeRuntime({ stream: undefined, dispatchError: new Error("sensitive provider detail") });
  const result = await runtime.execute(start(), signal());
  assert.equal(result.type, "failure");
  assert.equal(result.code, "SCANNER_BOOTSTRAP_FAILED");
  assert.equal(JSON.stringify(result).includes("sensitive"), false);
});

test("child runtime rejects a database context that does not match the IPC asset", async () => {
  const mismatched = { ...context(), assetId: "22222222-2222-4222-8222-222222222222" };
  const { runtime, calls } = makeRuntime({ resolvedContext: mismatched });
  const result = await runtime.execute(start(), signal());
  assert.equal(result.type, "failure");
  assert.equal(result.code, "SCANNER_BOOTSTRAP_FAILED");
  assert.equal(calls.dispatch, 0);
});

test("child runtime rejects a scanner result if shutdown aborts during execution", async () => {
  const controller = new AbortController();
  const source = { async *[Symbol.asyncIterator]() { yield new Uint8Array([1, 2, 3, 4]); } };
  const { runtime } = makeRuntime({
    stream: source,
    scanner: { async scan(value) { for await (const chunk of value.source) void chunk; controller.abort(); return { scanStatus: "clean" }; } },
  });
  const result = await runtime.execute(start(), controller.signal);
  assert.equal(result.type, "failure");
  assert.equal(result.code, "SCANNER_RESULT_INVALID");
});
