import test from "node:test";
import assert from "node:assert/strict";
import { runCustomerAssetScanChild } from "../dist/packages/assets/customer-asset-scan-child-supervisor.js";

const start = () => ({
  version: 3, type: "start", jobToken: "a".repeat(64), claimGeneration: 7,
  requestId: "request-1", workerId: "scanner.synthetic.v1:worker-1", scannerServiceId: "scanner.synthetic.v1",
  input: {
    tenantId: "tenant-1", applicationId: "application-1", assetId: "asset-1",
    checksumSha256: "b".repeat(64), sizeBytes: 512, mimeType: "application/pdf",
  },
});
const node = process.execPath;

test("scanner child supervisor accepts a result bound to the start token and generation", async () => {
  const outcome = await runCustomerAssetScanChild({
    executable: node,
    args: ["-e", "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const m=JSON.parse(s);process.stdout.write(JSON.stringify({version:3,type:'result',jobToken:m.jobToken,claimGeneration:m.claimGeneration,scannerServiceId:m.scannerServiceId,scanStatus:'clean'}));});"],
    start: start(), timeoutMs: 2_000, environment: { NODE_ENV: "test" },
  });
  assert.equal(outcome.kind, "result");
  assert.equal(outcome.value.scanStatus, "clean");
});

test("scanner child supervisor hard-kills a non-cooperative child at its deadline", async () => {
  const began = Date.now();
  await assert.rejects(runCustomerAssetScanChild({
    executable: node, args: ["-e", "process.stdin.resume();setInterval(()=>{},1000)"],
    start: start(), timeoutMs: 150,
  }), /CUSTOMER_ASSET_SCAN_CHILD_TIMEOUT/);
  assert.ok(Date.now() - began < 2_000, "hung child must be terminated within a bounded interval");
});

test("scanner child supervisor rejects malformed output and non-zero exits", async () => {
  await assert.rejects(runCustomerAssetScanChild({
    executable: node, args: ["-e", "process.stdout.write('not-json')"],
    start: start(), timeoutMs: 2_000,
  }), /CUSTOMER_ASSET_SCAN_CHILD_PROTOCOL_INVALID/);
  await assert.rejects(runCustomerAssetScanChild({
    executable: node, args: ["-e", "process.exit(9)"],
    start: start(), timeoutMs: 2_000,
  }), /CUSTOMER_ASSET_SCAN_CHILD_EXITED/);
});

test("scanner child supervisor rejects a response for another claim generation", async () => {
  await assert.rejects(runCustomerAssetScanChild({
    executable: node,
    args: ["-e", "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const m=JSON.parse(s);process.stdout.write(JSON.stringify({version:2,type:'result',jobToken:m.jobToken,claimGeneration:m.claimGeneration+1,scannerServiceId:m.scannerServiceId,scanStatus:'clean'}));});"],
    start: start(), timeoutMs: 2_000,
  }), /CUSTOMER_ASSET_SCAN_CHILD_PROTOCOL_INVALID/);
});

test("scanner child supervisor enforces output and environment bounds", async () => {
  await assert.rejects(runCustomerAssetScanChild({
    executable: node, args: ["-e", "process.stdout.write('x'.repeat(2048))"],
    start: start(), timeoutMs: 2_000, maxOutputBytes: 256,
  }), /CUSTOMER_ASSET_SCAN_CHILD_OUTPUT_LIMIT/);
  await assert.rejects(runCustomerAssetScanChild({
    executable: node, args: ["-e", "process.exit(0)"], start: start(), timeoutMs: 2_000,
    environment: { "DATABASE_URL": "postgres://must-not-be-passed" + "\n" },
  }), /CUSTOMER_ASSET_SCAN_CHILD_ENVIRONMENT_INVALID/);
});


test("scanner child receives only its explicit environment allowlist, never inherited parent secrets", async () => {
  const sentinel = "EPER_PARENT_SECRET_SENTINEL";
  const previous = process.env[sentinel];
  process.env[sentinel] = "must-not-cross-process-boundary";
  try {
    const script = [
      "if (process.env.EPER_PARENT_SECRET_SENTINEL) process.exit(41);",
      "if (process.env.NODE_ENV !== 'test') process.exit(42);",
      "let s='';process.stdin.on('data',c=>s+=c);",
      "process.stdin.on('end',()=>{const m=JSON.parse(s);",
      "process.stdout.write(JSON.stringify({version:2,type:'result',jobToken:m.jobToken,",
      "claimGeneration:m.claimGeneration,scannerServiceId:m.scannerServiceId,scanStatus:'clean'}));});",
    ].join("");
    const outcome = await runCustomerAssetScanChild({
      executable: node, args: ["-e", script], start: start(), timeoutMs: 2_000,
      environment: { NODE_ENV: "test" },
    });
    assert.equal(outcome.kind, "result",
      "child should see the explicit allowlisted variable and not inherit the parent sentinel");
  } finally {
    if (previous === undefined) delete process.env[sentinel];
    else process.env[sentinel] = previous;
  }
});
