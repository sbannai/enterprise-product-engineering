import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveWorkflowOutboxDispatcherRealPath } from "../dist/packages/workflows/workflow-outbox-dispatcher-module.js";

test("dispatcher module realpath stays inside the deployment dispatchers directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "eper-dispatcher-root-"));
  try {
    const dispatcherDir = join(root, "dist", "apps", "worker", "dispatchers");
    await mkdir(dispatcherDir, { recursive: true });
    const allowed = join(dispatcherDir, "approved.js");
    await writeFile(allowed, "export const approved = true;\n");
    assert.equal(
      await resolveWorkflowOutboxDispatcherRealPath(allowed, root),
      await import("node:fs/promises").then(fs => fs.realpath(allowed)),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher module realpath rejects symlinks escaping the deployment directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "eper-dispatcher-symlink-"));
  try {
    const dispatcherDir = join(root, "dist", "apps", "worker", "dispatchers");
    const outsideDir = join(root, "outside");
    await mkdir(dispatcherDir, { recursive: true });
    await mkdir(outsideDir, { recursive: true });
    const outside = join(outsideDir, "outside.js");
    const escape = join(dispatcherDir, "escape.js");
    await writeFile(outside, "export const escaped = true;\n");
    await symlink(outside, escape);
    await assert.rejects(
      () => resolveWorkflowOutboxDispatcherRealPath(escape, root),
      /WORKFLOW_OUTBOX_DISPATCHER_MODULE_PATH_INVALID/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher module realpath rejects missing files and non-JavaScript targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "eper-dispatcher-invalid-"));
  try {
    const dispatcherDir = join(root, "dist", "apps", "worker", "dispatchers");
    await mkdir(dispatcherDir, { recursive: true });
    await writeFile(join(dispatcherDir, "not-js.txt"), "not a module");
    await assert.rejects(
      () => resolveWorkflowOutboxDispatcherRealPath(join(dispatcherDir, "missing.js"), root),
      /WORKFLOW_OUTBOX_DISPATCHER_MODULE_NOT_FOUND/,
    );
    await assert.rejects(
      () => resolveWorkflowOutboxDispatcherRealPath(join(dispatcherDir, "not-js.txt"), root),
      /WORKFLOW_OUTBOX_DISPATCHER_MODULE_PATH_INVALID/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
