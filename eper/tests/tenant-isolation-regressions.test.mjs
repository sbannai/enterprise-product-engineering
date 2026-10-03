import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryAuditEvidenceStore } from "../dist/packages/capabilities/audit-evidence.js";
import { InMemoryExceptionStore } from "../dist/packages/capabilities/exception-handling.js";

const evidence = (tenantId, id) => ({
  id, tenantId, requirementId: "REQ-46304", action: "TEST",
  principalId: "tester", correlationId: `corr-${tenantId}-${id}`,
  occurredAt: "2026-10-03T00:00:00.000Z", payload: { result: "PASS" },
});
const exception = (tenantId, id, idempotencyKey) => ({
  id, tenantId, requirementId: "REQ-46305", code: "TEST",
  message: "test exception", idempotencyKey, createdAt: "2026-10-03T00:00:00.000Z",
});

test("audit evidence IDs are tenant-scoped and cannot be read across tenants", () => {
  const store = new InMemoryAuditEvidenceStore();
  store.append(evidence("tenant-a", "same-id"));
  store.append(evidence("tenant-b", "same-id"));
  assert.equal(store.get("tenant-a", "same-id")?.tenantId, "tenant-a");
  assert.equal(store.get("tenant-b", "same-id")?.tenantId, "tenant-b");
  assert.equal(store.get("tenant-c", "same-id"), undefined);
});

test("audit evidence duplicate ID is rejected within the same tenant", () => {
  const store = new InMemoryAuditEvidenceStore();
  store.append(evidence("tenant-a", "same-id"));
  assert.throws(() => store.append(evidence("tenant-a", "same-id")), /AUDIT_EVIDENCE_ALREADY_EXISTS/);
});

test("exception IDs and idempotency keys are tenant-scoped", () => {
  const store = new InMemoryExceptionStore();
  const a = store.create(exception("tenant-a", "same-id", "same-key"));
  const b = store.create(exception("tenant-b", "same-id", "same-key"));
  assert.equal(a.tenantId, "tenant-a");
  assert.equal(b.tenantId, "tenant-b");
  assert.equal(store.get("tenant-a", "same-id")?.tenantId, "tenant-a");
  assert.equal(store.get("tenant-b", "same-id")?.tenantId, "tenant-b");
  assert.equal(store.get("tenant-c", "same-id"), undefined);
});

test("identical idempotency retries return only the same tenant's exception", () => {
  const store = new InMemoryExceptionStore();
  const originalA = exception("tenant-a", "exception-a", "shared-key");
  const originalB = exception("tenant-b", "exception-b", "shared-key");
  store.create(originalA);
  store.create(originalB);
  const replayA = store.create({ ...originalA });
  const replayB = store.create({ ...originalB });
  assert.equal(replayA.id, "exception-a");
  assert.equal(replayB.id, "exception-b");
  assert.throws(
    () => store.create(exception("tenant-a", "different-id", "shared-key")),
    /IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST/,
  );
});

test("composite tenant keys cannot collide when identifiers contain delimiters", () => {
  const audit = new InMemoryAuditEvidenceStore();
  audit.append(evidence("a", "b:c"));
  audit.append(evidence("a:b", "c"));
  assert.equal(audit.get("a", "b:c")?.tenantId, "a");
  assert.equal(audit.get("a:b", "c")?.tenantId, "a:b");

  const exceptions = new InMemoryExceptionStore();
  exceptions.create(exception("a", "b:c", "shared:key"));
  exceptions.create(exception("a:b", "c", "shared:key"));
  assert.equal(exceptions.get("a", "b:c")?.tenantId, "a");
  assert.equal(exceptions.get("a:b", "c")?.tenantId, "a:b");
});
