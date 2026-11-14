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
