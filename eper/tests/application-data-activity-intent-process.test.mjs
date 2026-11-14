import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ApplicationDataActivityIntentProcess } from "../dist/packages/workflows/application-data-activity-intent-process.js";

const source = await readFile(new URL("../packages/workflows/application-data-activity-intent-process.ts", import.meta.url), "utf8");

test("activity intent process drains bounded intents per authorized application scope", () => {
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
      if (calls.length === 1) return { status: "succeeded", intentId: "intent-0001", result: {} };
      if (calls.length === 2) return { status: "retrying", intentId: "intent-0002", errorCode: "RETRY" };
      return { status: "idle" };
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
  assert.deepEqual(calls, [["tenant-01", "app-01"], ["tenant-01", "app-01"], ["tenant-01", "app-01"], ["tenant-02", "app-02"]]);
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

test("activity intent process deduplicates scopes and drains each scope until idle", async () => {
  const controller = new AbortController();
  const calls = [];
  const passes = [];
  const worker = { async runOnce(tenantId, applicationId) {
    calls.push(tenantId + "/" + applicationId);
    if (tenantId === "tenant-a" && calls.filter(value => value === "tenant-a/app-a").length === 1) {
      return { status: "succeeded", intentId: "intent-1", result: {} };
    }
    return { status: "idle" };
  }};
  const contexts = { async listActiveContexts() {
    return [
      { tenantId: "tenant-a", applicationId: "app-a" },
      { tenantId: "tenant-a", applicationId: "app-a" },
      { tenantId: "tenant-b", applicationId: "app-b" },
    ];
  }};
  const process = new ApplicationDataActivityIntentProcess(worker, contexts, {
    idlePollMs: 50,
    maxExecutionsPerContext: 3,
    onPass(result) { passes.push(result); controller.abort(); },
  });
  await process.run(controller.signal);
  assert.deepEqual(calls, ["tenant-a/app-a", "tenant-a/app-a", "tenant-b/app-b"]);
  assert.equal(passes.length, 1);
  assert.equal(passes[0].contextsVisited, 2);
  assert.equal(passes[0].executions, 1);
  assert.equal(passes[0].succeeded, 1);
  assert.equal(passes[0].idle, 1);
});
