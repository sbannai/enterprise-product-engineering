import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryAuditEvidenceStore } from "../dist/packages/capabilities/audit-evidence.js";

test("audit payload cannot be mutated through caller or returned references", () => {
  const store = new InMemoryAuditEvidenceStore();
  const payload = { result: "PASS", details: { attempts: [1, 2] } };
  const appended = store.append({
    id: "immutable-evidence",
    tenantId: "tenant-a",
    requirementId: "REQ-46304",
    action: "TEST",
    principalId: "tester",
    correlationId: "immutable-correlation",
    occurredAt: "2026-10-03T00:00:00.000Z",
    payload,
  });
  const originalHash = appended.integrityHash;

  payload.details.attempts.push(3);
  appended.payload.details.attempts.push(4);
  const fetched = store.get("tenant-a", "immutable-evidence");
  fetched.payload.details.attempts.push(5);

  const again = store.get("tenant-a", "immutable-evidence");
  assert.deepEqual(again.payload, { result: "PASS", details: { attempts: [1, 2] } });
  assert.equal(again.integrityHash, originalHash);
});

test("audit evidence rejects payloads that cannot be serialized as JSON", () => {
  const store = new InMemoryAuditEvidenceStore();
  assert.throws(() => store.append({
    id: "invalid-evidence",
    tenantId: "tenant-a",
    requirementId: "REQ-46304",
    action: "TEST",
    principalId: "tester",
    correlationId: "invalid-correlation",
    occurredAt: "2026-10-03T00:00:00.000Z",
    payload: undefined,
  }), /AUDIT_PAYLOAD_NOT_SERIALIZABLE/);
});
