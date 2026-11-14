import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("developer verification applies capability prerequisites before workflow migrations", async () => {
  const script = await readFile(new URL("../scripts/dev-verify.mjs", import.meta.url), "utf8");
  const capabilities = script.indexOf('"migrate:capabilities"');
  const workflows = script.indexOf('"migrate:workflows"');
  assert.notEqual(capabilities, -1);
  assert.notEqual(workflows, -1);
  assert.ok(capabilities < workflows, "capability persistence must precede workflow worker-access grants");
});
