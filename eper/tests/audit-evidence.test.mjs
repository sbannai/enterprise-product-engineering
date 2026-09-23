import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryAuditEvidenceStore } from "../dist/packages/capabilities/audit-evidence.js";

const evidence = {
  id: "ev-1",
  tenantId: "tenant-a",
  requirementId: "REQ-46304",
  action: "CREATE",
  principalId: "user-a",
  correlationId: "corr-1",
  occurredAt: "2026-09-23T15:00:00Z",
  payload: { recordId: "r1" },
};

test("audit evidence receives a deterministic integrity hash", () => {
  const store = new InMemoryAuditEvidenceStore();
  const entry = store.append(evidence);

  assert.equal(entry.id, "ev-1");
  assert.match(entry.integrityHash, /^[a-f0-9]{64}$/);
});

test("audit evidence is isolated by tenant and queryable by requirement", () => {
  const store = new InMemoryAuditEvidenceStore();
  store.append(evidence);
  store.append({ ...evidence, id: "ev-2", tenantId: "tenant-b" });

  assert.equal(store.get("tenant-a", "ev-1")?.tenantId, "tenant-a");
  assert.equal(store.get("tenant-b", "ev-1"), undefined);
  assert.equal(store.listByRequirement("tenant-a", "REQ-46304").length, 1);
});

test("audit evidence rejects duplicate IDs and incomplete context", () => {
  const store = new InMemoryAuditEvidenceStore();
  store.append(evidence);

  assert.throws(() => store.append(evidence), /AUDIT_EVIDENCE_ALREADY_EXISTS/);
  assert.throws(
    () => store.append({ ...evidence, id: "", tenantId: "" }),
    /AUDIT_EVIDENCE_CONTEXT_REQUIRED/,
  );
});
