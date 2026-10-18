import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileExceptionStore } from "../dist/packages/capabilities/json-file-exception-store.js";
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

test("retry count increments only on retry transitions", () => {
  const store = new InMemoryExceptionStore();
  store.create(base);
  assert.equal(store.get("tenant-a", "ex-1").retryCount, 0);
  assert.equal(store.transition("tenant-a", "ex-1", { state: "RETRYING" }).retryCount, 1);
  assert.equal(store.transition("tenant-a", "ex-1", { state: "RETRYING" }).retryCount, 2);
  assert.equal(store.transition("tenant-a", "ex-1", { state: "ESCALATED" }).retryCount, 2);
  assert.equal(store.transition("tenant-a", "ex-1", { state: "RESOLVED" }).retryCount, 2);
  assert.equal(store.get("tenant-a", "ex-1").retryCount, 2);
});


test("exception creation rejects malformed fields and timestamps with stable error codes", () => {
  const store = new InMemoryExceptionStore();
  for (const input of [
    { input: { ...base, id: "" }, error: /EXCEPTION_CONTEXT_REQUIRED/ },
    { input: { ...base, message: " " }, error: /EXCEPTION_INPUT_INVALID/ },
    { input: { ...base, code: "" }, error: /EXCEPTION_CONTEXT_REQUIRED/ },
    { input: { ...base, idempotencyKey: "" }, error: /EXCEPTION_CONTEXT_REQUIRED/ },
    { input: { ...base, createdAt: "not-a-date" }, error: /EXCEPTION_INPUT_INVALID/ },
    { input: { ...base, owner: "" }, error: /EXCEPTION_INPUT_INVALID/ },
  ]) {
    assert.throws(() => store.create(input.input), input.error);
  }
});

test("exception transitions reject invalid runtime patches without mutation", () => {
  const store = new InMemoryExceptionStore();
  store.create(base);
  assert.throws(() => store.transition("tenant-a", "ex-1", { state: "BOGUS" }), /EXCEPTION_STATE_INVALID/);
  assert.throws(() => store.transition("tenant-a", "ex-1", { owner: " " }), /EXCEPTION_OWNER_INVALID/);
  assert.throws(() => store.transition("tenant-a", "ex-1", { message: "" }), /EXCEPTION_MESSAGE_INVALID/);
  assert.equal(store.get("tenant-a", "ex-1").state, "OPEN");
  assert.equal(store.get("tenant-a", "ex-1").owner, undefined);
});


test("JSON-file exception store rejects malformed persisted lifecycle rows", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-exceptions-corrupt-"));
  const file = join(directory, "state.json");
  try {
    writeFileSync(file, JSON.stringify({
      schemaVersion: 1,
      exceptions: [{ ...base, state: "UNKNOWN", retryCount: -1, updatedAt: base.createdAt }],
      lifecycleEvidence: [],
    }));
    const store = new JsonFileExceptionStore(file);
    assert.throws(() => store.snapshot(), /PERSISTENCE_DATA_INVALID/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("JSON-file exception callbacks fail before state commit and preserve idempotency", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-exception-callback-"));
  try {
    const store = new JsonFileExceptionStore(join(directory, "state.json"));
    assert.throws(
      () => store.create(base, () => { throw new Error("AUDIT_WRITE_FAILED"); }),
      /AUDIT_WRITE_FAILED/,
    );
    assert.deepEqual(store.snapshot(), []);
    const created = store.create(base);
    assert.equal(created.id, "ex-1");
    assert.equal(created.state, "OPEN");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("JSON-file exception transition callback failure leaves persisted state unchanged", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-exception-transition-callback-"));
  try {
    const store = new JsonFileExceptionStore(join(directory, "state.json"));
    store.create(base);
    assert.throws(
      () => store.transition("tenant-a", "ex-1", { state: "ESCALATED" }, () => { throw new Error("AUDIT_WRITE_FAILED"); }),
      /AUDIT_WRITE_FAILED/,
    );
    assert.equal(store.get("tenant-a", "ex-1").state, "OPEN");
    assert.equal(store.get("tenant-a", "ex-1").retryCount, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("JSON-file exception store rejects malformed create input without persisting", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-exceptions-"));
  try {
    const store = new JsonFileExceptionStore(join(directory, "state.json"));
    assert.throws(() => store.create({ ...base, message: " " }), /EXCEPTION_INPUT_INVALID/);
    assert.deepEqual(store.snapshot(), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test("JSON-file exception store detects tampered persisted lifecycle evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-evidence-tamper-"));
  const file = join(directory, "state.json");
  try {
    const store = new JsonFileExceptionStore(file);
    store.append({
      id: "audit-1",
      tenantId: "tenant-a",
      requirementId: "REQ-46305",
      principalId: "tester-1",
      correlationId: "corr-1",
      action: "EXCEPTION_CREATED",
      occurredAt: "2026-10-18T11:00:00Z",
      payload: { exceptionId: "ex-1" },
    });
    const state = JSON.parse(readFileSync(file, "utf8"));
    state.lifecycleEvidence[0].payload.exceptionId = "ex-tampered";
    writeFileSync(file, JSON.stringify(state));
    assert.throws(() => store.snapshot(), /PERSISTENCE_DATA_INVALID/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test("JSON-file exception store rejects duplicate persisted audit IDs and exception idempotency keys", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-duplicate-state-"));
  const file = join(directory, "state.json");
  try {
    const store = new JsonFileExceptionStore(file);
    store.create(base);
    const state = JSON.parse(readFileSync(file, "utf8"));
    state.exceptions.push({ ...state.exceptions[0], id: "ex-2" });
    writeFileSync(file, JSON.stringify(state));
    assert.throws(() => store.snapshot(), /PERSISTENCE_DATA_INVALID/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("JSON-file exception store rejects duplicate audit IDs in one tenant", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-duplicate-audit-"));
  const file = join(directory, "state.json");
  try {
    const store = new JsonFileExceptionStore(file);
    const entry = {
      id: "audit-duplicate", tenantId: "tenant-a", requirementId: "REQ-46305",
      principalId: "tester-1", correlationId: "corr-1", action: "EXCEPTION_CREATED",
      occurredAt: "2026-10-18T11:00:00Z", payload: { exceptionId: "ex-1" },
    };
    store.append(entry);
    const state = JSON.parse(readFileSync(file, "utf8"));
    state.lifecycleEvidence.push(state.lifecycleEvidence[0]);
    writeFileSync(file, JSON.stringify(state));
    assert.throws(() => store.snapshot(), /PERSISTENCE_DATA_INVALID/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test("JSON-file exception store rejects malformed audit inputs before persistence", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-audit-input-"));
  const file = join(directory, "state.json");
  try {
    const store = new JsonFileExceptionStore(file);
    const valid = {
      id: "audit-1", tenantId: "tenant-a", requirementId: "REQ-46305",
      principalId: "tester-1", correlationId: "corr-1", action: "EXCEPTION_CREATED",
      occurredAt: "2026-10-18T11:00:00Z", payload: { exceptionId: "ex-1" },
    };
    assert.throws(() => store.append({ ...valid, id: 42 }), /AUDIT_EVIDENCE_CONTEXT_REQUIRED/);
    assert.throws(() => store.append({ ...valid, action: " " }), /AUDIT_EVIDENCE_FIELDS_REQUIRED/);
    assert.throws(() => store.append({ ...valid, occurredAt: "not-a-date" }), /AUDIT_EVIDENCE_TIMESTAMP_INVALID/);
    assert.throws(() => store.append({ ...valid, payload: [] }), /AUDIT_PAYLOAD_INVALID/);
    assert.deepEqual(store.listByRequirement("tenant-a", "REQ-46305"), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("JSON-file exception store validates legacy array rows instead of bypassing integrity checks", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-legacy-exceptions-"));
  const file = join(directory, "state.json");
  try {
    writeFileSync(file, JSON.stringify([{ ...base, state: "UNKNOWN", retryCount: -1, updatedAt: base.createdAt }]));
    const store = new JsonFileExceptionStore(file);
    assert.throws(() => store.snapshot(), /PERSISTENCE_DATA_INVALID/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("JSON-file exception store preserves valid legacy array compatibility", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-legacy-valid-exceptions-"));
  const file = join(directory, "state.json");
  try {
    writeFileSync(file, JSON.stringify([{ ...base, state: "OPEN", retryCount: 0, updatedAt: base.createdAt }]));
    const store = new JsonFileExceptionStore(file);
    assert.equal(store.snapshot().length, 1);
    assert.equal(store.get("tenant-a", "ex-1").state, "OPEN");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
