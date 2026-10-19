import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileAuditEvidenceStore } from "../dist/packages/capabilities/json-file-audit-evidence-store.js";

function withStore(run) {
  const directory = mkdtempSync(join(tmpdir(), "eper-audit-store-"));
  try { run(new JsonFileAuditEvidenceStore(join(directory, "audit.json"))); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

const evidence = {
  id: "ev-1", tenantId: "tenant-a", requirementId: "REQ-46304", action: "CREATE",
  principalId: "user-a", correlationId: "corr-1",
  occurredAt: "2026-09-23T15:00:00Z", payload: { nested: { labels: ["original"] } },
};

test("JSON audit store rejects malformed context, fields and timestamps without storing", () => {
  withStore(store => {
    assert.throws(() => store.append(null), /AUDIT_EVIDENCE_CONTEXT_REQUIRED/);
    assert.throws(() => store.append({ ...evidence, id: 7 }), /AUDIT_EVIDENCE_CONTEXT_REQUIRED/);
    assert.throws(() => store.append({ ...evidence, principalId: " " }), /AUDIT_EVIDENCE_CONTEXT_REQUIRED/);
    assert.throws(() => store.append({ ...evidence, action: 42 }), /AUDIT_EVIDENCE_FIELDS_REQUIRED/);
    assert.throws(() => store.append({ ...evidence, occurredAt: "not-a-date" }), /AUDIT_EVIDENCE_TIMESTAMP_INVALID/);
    assert.equal(store.listByRequirement("tenant-a", "REQ-46304").length, 0);
  });
});

test("JSON audit store detects tampering and isolates tenants", () => {
  withStore(store => {
    const entry = store.append(evidence);
    assert.equal(store.verify(entry), true);
    assert.equal(store.verify({ ...entry, action: "DELETE" }), false);
    assert.equal(store.get("tenant-b", "ev-1"), undefined);
    store.append({ ...evidence, id: "ev-2", tenantId: "tenant-b" });
    assert.equal(store.listByRequirement("tenant-a", "REQ-46304").length, 1);
  });
});

test("JSON audit store deep-clones input and returned evidence", () => {
  withStore(store => {
    const input = structuredClone(evidence);
    const entry = store.append(input);
    input.payload.nested.labels.push("input-change");
    entry.payload.nested.labels.push("output-change");
    const saved = store.get("tenant-a", "ev-1");
    assert.deepEqual(saved.payload, { nested: { labels: ["original"] } });
    assert.equal(store.verify(saved), true);
  });
});
