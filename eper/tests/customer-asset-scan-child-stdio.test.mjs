import test from "node:test";
import assert from "node:assert/strict";
import { Readable, PassThrough } from "node:stream";
import { runCustomerAssetScanChildStdio } from "../dist/packages/assets/customer-asset-scan-child-stdio.js";

const start = () => ({
  version: 3, type: "start", jobToken: "a".repeat(64), claimGeneration: 9,
  requestId: "stdio-request", workerId: "scanner.test.v1:worker", scannerServiceId: "scanner.test.v1",
  input: { tenantId: "tenant", applicationId: "app", assetId: "11111111-1111-4111-8111-111111111111",
    checksumSha256: "b".repeat(64), sizeBytes: 1, mimeType: "application/pdf" },
});
async function invoke(input, options = {}) {
  const stdout = new PassThrough();
  const chunks = [];
  stdout.on("data", chunk => chunks.push(chunk));
  const exitCode = await runCustomerAssetScanChildStdio({
    stdin: Readable.from(input),
    stdout,
    runtime: options.runtime ?? { async execute(message) {
      return { version: 3, type: "result", jobToken: message.jobToken,
        claimGeneration: message.claimGeneration, scannerServiceId: message.scannerServiceId, scanStatus: "clean" };
    } },
    signal: new AbortController().signal,
    ...(options.maxInputBytes === undefined ? {} : { maxInputBytes: options.maxInputBytes }),
  });
  return { exitCode, output: Buffer.concat(chunks).toString("utf8") };
}

test("child stdio accepts one bounded start message and emits one result", async () => {
  const { exitCode, output } = await invoke([Buffer.from(JSON.stringify(start()))]);
  assert.equal(exitCode, 0);
  const message = JSON.parse(output);
  assert.equal(message.type, "result");
  assert.equal(message.jobToken, "a".repeat(64));
  assert.equal(message.scanStatus, "clean");
});

test("child stdio rejects malformed and non-start messages without protocol output", async () => {
  for (const payload of ["not-json", JSON.stringify({ version: 3, type: "result" })]) {
    const { exitCode, output } = await invoke([Buffer.from(payload)]);
    assert.equal(exitCode, 2);
    assert.equal(output, "");
  }
});

test("child stdio rejects input beyond its byte ceiling", async () => {
  const { exitCode, output } = await invoke([Buffer.from(JSON.stringify(start()))], { maxInputBytes: 256 });
  assert.equal(exitCode, 2);
  assert.equal(output, "");
});

test("child stdio converts runtime exceptions into process failure without leaking diagnostics", async () => {
  const { exitCode, output } = await invoke([Buffer.from(JSON.stringify(start()))], {
    runtime: { async execute() { throw new Error("secret provider diagnostic"); } },
  });
  assert.equal(exitCode, 2);
  assert.equal(output, "");
  assert.equal(output.includes("secret"), false);
});
