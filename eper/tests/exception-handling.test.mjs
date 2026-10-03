import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryExceptionStore } from "../dist/packages/capabilities/exception-handling.js";

const base = {
  id: "ex-1",
  tenantId: "tenant-a",
  requirementId: "REQ-46305",
  code: "PROCESS_FAILURE",
  message: "Processing failed",
  idempotencyKey: "idem-1",
  createdAt: "2026-09-23T15:00:00Z",
};

test("exception workflow starts OPEN and supports retry", () => {
  const store = new InMemoryExceptionStore();
  const created = store.create(base);
  assert.equal(created.state, "OPEN");
  assert.equal(created.retryCount, 0);

  const retry = store.transition("tenant-a", "ex-1", { state: "RETRYING" });
  assert.equal(retry.state, "RETRYING");
  assert.equal(retry.retryCount, 1);
});

test("exception workflow supports escalation and resolution", () => {
  const store = new InMemoryExceptionStore();
  store.create(base);

  const escalated = store.transition("tenant-a", "ex-1", { state: "ESCALATED", owner: "ops" });
  assert.equal(escalated.state, "ESCALATED");
  assert.equal(escalated.owner, "ops");

  const resolved = store.transition("tenant-a", "ex-1", { state: "RESOLVED" });
  assert.equal(resolved.state, "RESOLVED");
});

test("exception workflow enforces idempotency and valid transitions", () => {
  const store = new InMemoryExceptionStore();
  const first = store.create(base);
  const duplicate = store.create({ ...base });
  assert.equal(duplicate.id, first.id);
  assert.throws(
    () => store.create({ ...base, id: "ex-2", message: "Different request" }),
    /IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST/,
  );

  store.transition("tenant-a", "ex-1", { state: "RESOLVED" });
  assert.throws(
    () => store.transition("tenant-a", "ex-1", { state: "RETRYING" }),
    /EXCEPTION_INVALID_TRANSITION/,
  );
});

test("exception workflow rejects cross-tenant access and incomplete context", () => {
  const store = new InMemoryExceptionStore();
  store.create(base);

  assert.equal(store.get("tenant-b", "ex-1"), undefined);
  assert.throws(
    () => store.create({ ...base, id: "", tenantId: "" }),
    /EXCEPTION_CONTEXT_REQUIRED/,
  );
});

test("transition callback runs before exception state is committed", () => {
  const store = new InMemoryExceptionStore();
  store.create(base);
  assert.throws(() => store.transition("tenant-a", "ex-1", { state: "ESCALATED" }, () => { throw new Error("CALLBACK_FAILED"); }), /CALLBACK_FAILED/);
  assert.equal(store.get("tenant-a", "ex-1").state, "OPEN");
});

test("create callback failure leaves no exception and does not consume idempotency key", () => {
  const store = new InMemoryExceptionStore();
  assert.throws(() => store.create(base, () => { throw new Error("AUDIT_WRITE_FAILED"); }), /AUDIT_WRITE_FAILED/);
  assert.equal(store.get("tenant-a", "ex-1"), undefined);
  const created = store.create(base);
  assert.equal(created.id, "ex-1");
  assert.equal(created.state, "OPEN");
});
