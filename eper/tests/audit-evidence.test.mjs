import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileAuditEvidenceStore } from "../dist/packages/capabilities/json-file-audit-evidence-store.js";
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


test("audit evidence rejects non-string context and action fields before storage", () => {
  const store = new InMemoryAuditEvidenceStore();
  assert.throws(() => store.append({ ...evidence, id: 42 }), /AUDIT_EVIDENCE_CONTEXT_REQUIRED/);
  assert.throws(() => store.append({ ...evidence, tenantId: null }), /AUDIT_EVIDENCE_CONTEXT_REQUIRED/);
  assert.throws(() => store.append({ ...evidence, principalId: " " }), /AUDIT_EVIDENCE_CONTEXT_REQUIRED/);
  assert.throws(() => store.append({ ...evidence, action: 9 }), /AUDIT_EVIDENCE_FIELDS_REQUIRED/);
  assert.throws(() => store.append({ ...evidence, occurredAt: null }), /AUDIT_EVIDENCE_FIELDS_REQUIRED/);
  assert.deepEqual(store.listByRequirement("tenant-a", "REQ-46304"), []);
});


test("in-memory audit store matches JSON-file payload validation errors", () => {
  const store = new InMemoryAuditEvidenceStore();
  assert.throws(() => store.append({ ...evidence, payload: null }), /AUDIT_PAYLOAD_INVALID/);
  assert.throws(() => store.append({ ...evidence, payload: [] }), /AUDIT_PAYLOAD_INVALID/);
  assert.throws(() => store.append({ ...evidence, payload: "not-an-object" }), /AUDIT_PAYLOAD_INVALID/);
  const circular = {};
  circular.self = circular;
  assert.throws(() => store.append({ ...evidence, payload: circular }), /AUDIT_PAYLOAD_NOT_SERIALIZABLE/);
  assert.deepEqual(store.listByRequirement("tenant-a", "REQ-46304"), []);
});

test("audit input error codes and no-mutation guarantees match across adapters", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-audit-adapter-parity-"));
  try {
    const stores = [
      new InMemoryAuditEvidenceStore(),
      new JsonFileAuditEvidenceStore(join(directory, "audit.json")),
    ];
    const invalidInputs = [
      [{ ...evidence, id: 42 }, /AUDIT_EVIDENCE_CONTEXT_REQUIRED/],
      [{ ...evidence, tenantId: null }, /AUDIT_EVIDENCE_CONTEXT_REQUIRED/],
      [{ ...evidence, action: 9 }, /AUDIT_EVIDENCE_FIELDS_REQUIRED/],
      [{ ...evidence, occurredAt: "not-a-date" }, /AUDIT_EVIDENCE_TIMESTAMP_INVALID/],
      [{ ...evidence, payload: null }, /AUDIT_PAYLOAD_INVALID/],
      [{ ...evidence, payload: [] }, /AUDIT_PAYLOAD_INVALID/],
    ];
    for (const store of stores) {
      for (const [input, expectedError] of invalidInputs) {
        assert.throws(() => store.append(input), expectedError);
      }
      assert.deepEqual(store.listByRequirement("tenant-a", "REQ-46304"), []);
      const accepted = store.append(evidence);
      assert.equal(accepted.id, evidence.id);
      assert.throws(() => store.append(evidence), /AUDIT_EVIDENCE_ALREADY_EXISTS/);
      assert.equal(store.listByRequirement("tenant-a", "REQ-46304").length, 1);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("audit integrity verification and read isolation match across adapters", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-audit-integrity-parity-"));
  try {
    const stores = [
      new InMemoryAuditEvidenceStore(),
      new JsonFileAuditEvidenceStore(join(directory, "audit.json")),
    ];
    for (const store of stores) {
      const entry = store.append(evidence);
      assert.equal(store.verify(entry), true);
      assert.equal(store.verify({ ...entry, action: "DELETE" }), false);
      assert.equal(store.verify({ ...entry, payload: { recordId: "tampered" } }), false);
      assert.equal(store.verify({ ...entry, integrityHash: "bad" }), false);
      assert.equal(store.get("tenant-b", entry.id), undefined);
      assert.equal(store.listByRequirement("tenant-b", "REQ-46304").length, 0);
      assert.equal(store.get("tenant-a", entry.id).integrityHash, entry.integrityHash);
      assert.equal(store.listByRequirement("tenant-a", "REQ-46304").length, 1);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("audit evidence IDs are unique within a tenant but isolated across tenants", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-audit-tenant-identity-"));
  try {
    const stores = [
      new InMemoryAuditEvidenceStore(),
      new JsonFileAuditEvidenceStore(join(directory, "audit.json")),
    ];
    for (const store of stores) {
      const tenantA = store.append(evidence);
      const tenantB = store.append({ ...evidence, tenantId: "tenant-b", payload: { recordId: "r2" } });
      assert.equal(tenantA.id, tenantB.id);
      assert.equal(store.get("tenant-a", evidence.id).tenantId, "tenant-a");
      assert.equal(store.get("tenant-b", evidence.id).tenantId, "tenant-b");
      assert.throws(() => store.append(evidence), /AUDIT_EVIDENCE_ALREADY_EXISTS/);
      assert.equal(store.listByRequirement("tenant-a", evidence.requirementId).length, 1);
      assert.equal(store.listByRequirement("tenant-b", evidence.requirementId).length, 1);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("JSON-file audit store rejects malformed fields before persistence", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-audit-"));
  try {
    const store = new JsonFileAuditEvidenceStore(join(directory, "audit.json"));
    assert.throws(() => store.append({ ...evidence, id: 42 }), /AUDIT_EVIDENCE_CONTEXT_REQUIRED/);
    assert.throws(() => store.append({ ...evidence, tenantId: null }), /AUDIT_EVIDENCE_CONTEXT_REQUIRED/);
    assert.throws(() => store.append({ ...evidence, action: 9 }), /AUDIT_EVIDENCE_FIELDS_REQUIRED/);
    assert.throws(() => store.append({ ...evidence, occurredAt: "not-a-date" }), /AUDIT_EVIDENCE_TIMESTAMP_INVALID/);
    assert.throws(() => store.append({ ...evidence, payload: null }), /AUDIT_PAYLOAD_INVALID/);
    assert.throws(() => store.append({ ...evidence, payload: [] }), /AUDIT_PAYLOAD_INVALID/);
    assert.throws(() => store.append({ ...evidence, payload: "not-an-object" }), /AUDIT_PAYLOAD_INVALID/);
    const circular = {};
    circular.self = circular;
    assert.throws(() => store.append({ ...evidence, payload: circular }), /AUDIT_PAYLOAD_NOT_SERIALIZABLE/);
    assert.deepEqual(store.listByRequirement("tenant-a", "REQ-46304"), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test("JSON-file audit store rejects tampered and duplicate persisted evidence on read", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-audit-corrupt-"));
  const file = join(directory, "audit.json");
  try {
    const store = new JsonFileAuditEvidenceStore(file);
    store.append(evidence);
    const persisted = JSON.parse(readFileSync(file, "utf8"));
    persisted[0].payload.recordId = "tampered";
    writeFileSync(file, JSON.stringify(persisted));
    assert.throws(() => store.get("tenant-a", "ev-1"), /PERSISTENCE_DATA_INVALID/);
    persisted[0].payload.recordId = "r1";
    persisted.push({ ...persisted[0] });
    writeFileSync(file, JSON.stringify(persisted));
    assert.throws(() => store.listByRequirement("tenant-a", "REQ-46304"), /PERSISTENCE_DATA_INVALID/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
