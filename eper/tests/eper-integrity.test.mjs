import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const requirementsRoot = join(process.cwd(), "dist", "requirements");

test("EPER contains exactly 228 generated requirement modules", async () => {
  const entries = (await readdir(requirementsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^REQ-\d{5}$/.test(entry.name));
  assert.equal(entries.length, 228);
});

test("all requirement modules expose traceability metadata", async () => {
  const entries = (await readdir(requirementsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^REQ-\d{5}$/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const entry of entries) {
    const module = await import(join(requirementsRoot, entry.name, "index.js"));
    assert.equal(module.requirement.id, entry.name);
    assert.match(module.requirement.brd, /^BRD-001-REQ-\d{5}$/);
    assert.match(module.requirement.srs, /^SRS-FR-\d+$/);
    assert.match(module.requirement.pattern, /^XX0[1-6]$/);
  }
});

test("tenant context rejects missing tenant identity", async () => {
  const { requireTenantContext } = await import("../dist/packages/tenant/index.js");
  assert.throws(() => requireTenantContext({ tenantId: "", privilegedCrossTenant: false }));
});
