import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../packages/workflows/application-data-activity-intent-process.ts", import.meta.url), "utf8");

test("activity intent process continuously executes one intent per authorized application scope", () => {
  assert.match(source, /listActiveContexts\(signal\)/);
  assert.match(source, /worker\.runOnce\(context\.tenantId, context\.applicationId\)/);
  assert.match(source, /new Map<string, WorkflowOutboxContext>/);
  assert.match(source, /waitForNextPass\(signal, this\.idlePollMs\)/);
});

test("activity intent process records distinct outcomes and isolates scope failures", () => {
  assert.match(source, /result\.status === "succeeded"/);
  assert.match(source, /result\.status === "retrying"/);
  assert.match(source, /result\.status === "dead_letter"/);
  assert.match(source, /telemetry must not stop execution/);
});

test("activity intent process bounds context count and polling configuration", () => {
  assert.match(source, /idlePollMs < 50/);
  assert.match(source, /idlePollMs > 60_000/);
  assert.match(source, /maxContextsPerPass < 1/);
  assert.match(source, /maxContextsPerPass > 10_000/);
});

test("activity intent process executes deduplicated scopes and stops cleanly on abort", async () => {
  const { ApplicationDataActivityIntentProcess } = await import("../dist/packages/workflows/application-data-activity-intent-process.js");
  const controller = new AbortController();
  const calls = [];
  let pass;
  const worker = {
    async runOnce(tenantId, applicationId) {
      calls.push([tenantId, applicationId]);
      return calls.length === 1
        ? { status: "succeeded", intentId: "intent-0001", result: {} }
        : { status: "retrying", intentId: "intent-0002", errorCode: "RETRY" };
    },
  };
  const contexts = {
    async listActiveContexts() {
      return [
        { tenantId: "tenant-01", applicationId: "app-01" },
        { tenantId: "tenant-01", applicationId: "app-01" },
        { tenantId: "tenant-02", applicationId: "app-02" },
      ];
    },
  };
  const process = new ApplicationDataActivityIntentProcess(worker, contexts, {
    idlePollMs: 50,
    onPass(result) { pass = result; controller.abort(); },
  });
  await process.run(controller.signal);
  assert.deepEqual(calls, [["tenant-01", "app-01"], ["tenant-02", "app-02"]]);
  assert.equal(pass.contextsVisited, 2);
  assert.equal(pass.succeeded, 1);
  assert.equal(pass.retrying, 1);
  assert.equal(pass.errors, 0);
});

test("activity intent process drains bounded batches instead of executing only one record per poll", () => {
  assert.match(source, /maxExecutionsPerContext\?: number/);
  assert.match(source, /maxExecutionsPerContext = options\.maxExecutionsPerContext \?\? 25/);
  assert.match(source, /attempt < this\.maxExecutionsPerContext/);
  assert.match(source, /total\.executions \+= 1/);
  assert.match(source, /if \(result\.status === "idle"\)/);
});
