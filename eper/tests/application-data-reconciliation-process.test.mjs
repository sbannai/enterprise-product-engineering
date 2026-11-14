import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../packages/workflows/application-data-reconciliation-process.ts", import.meta.url), "utf8");

test("application data reconciliation process continuously scans authorized tenant/application contexts", () => {
  assert.match(source, /listActiveContexts\(signal\)/);
  assert.match(source, /reconciler\.runOnce\(context\.tenantId, context\.applicationId\)/);
  assert.match(source, /maxContextsPerPass/);
  assert.match(source, /new Map<string, WorkflowOutboxContext>/);
  assert.match(source, /waitForNextPass\(signal, this\.idlePollMs\)/);
});

test("reconciliation process isolates per-context failures and protects the loop from telemetry failures", () => {
  assert.match(source, /catch \(error\) \{\s*total\.errors \+= 1;/);
  assert.match(source, /telemetry cannot stop reconciliation/);
  assert.match(source, /telemetry cannot stop reconciliation/);
  assert.match(source, /WORKFLOW_APPLICATION_DATA_RECONCILIATION_CONTEXT_SOURCE_INVALID/);
});

test("reconciliation process validates polling and context limits", () => {
  assert.match(source, /idlePollMs < 50/);
  assert.match(source, /idlePollMs > 60_000/);
  assert.match(source, /maxContextsPerPass < 1/);
  assert.match(source, /maxContextsPerPass > 10_000/);
});
