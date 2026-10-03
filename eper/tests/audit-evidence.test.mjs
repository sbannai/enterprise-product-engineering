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

test("audit evidence verification detects changed fields and payloads", () => {
  const store = new InMemoryAuditEvidenceStore();
  const entry = store.append(evidence);
  assert.equal(store.verify(entry), true);
  assert.equal(store.verify({ ...entry, action: "DELETE" }), false);
  assert.equal(store.verify({ ...entry, payload: { recordId: "changed" } }), false);
  assert.equal(store.verify({ ...entry, integrityHash: "not-a-hash" }), false);
});

test("audit evidence verification is safe for malformed evidence", () => {
  const store = new InMemoryAuditEvidenceStore();
  assert.equal(store.verify(null), false);
  const circular = {};
  circular.self = circular;
  assert.equal(store.verify({ ...evidence, payload: circular, integrityHash: "a".repeat(64) }), false);
});

test("audit evidence rejects missing action and timestamp", () => {
  const store = new InMemoryAuditEvidenceStore();
  assert.throws(
    () => store.append({ ...evidence, action: "" }),
    /AUDIT_EVIDENCE_FIELDS_REQUIRED/,
  );
  assert.throws(
    () => store.append({ ...evidence, occurredAt: "" }),
    /AUDIT_EVIDENCE_FIELDS_REQUIRED/,
  );
  assert.throws(
    () => store.append({ ...evidence, occurredAt: "not-a-timestamp" }),
    /AUDIT_EVIDENCE_TIMESTAMP_INVALID/,
  );
});
