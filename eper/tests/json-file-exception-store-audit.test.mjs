import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileExceptionStore } from "../dist/packages/capabilities/json-file-exception-store.js";

function withStore(run) {
  const directory = mkdtempSync(join(tmpdir(), "eper-exception-store-"));
  try { run(new JsonFileExceptionStore(join(directory, "state.json"))); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

const evidence = {
  id: "audit-1", tenantId: "tenant-a", requirementId: "REQ-46305",
  action: "EXCEPTION_CREATED", principalId: "user-a", correlationId: "corr-1",
  occurredAt: "2026-09-23T15:00:00Z", payload: { exceptionId: "ex-1" },
};

test("combined exception store rejects malformed embedded audit evidence", () => {
  withStore(store => {
    assert.throws(() => store.append(null), /AUDIT_EVIDENCE_CONTEXT_REQUIRED/);
    assert.throws(() => store.append({ ...evidence, id: 42 }), /AUDIT_EVIDENCE_CONTEXT_REQUIRED/);
    assert.throws(() => store.append({ ...evidence, principalId: " " }), /AUDIT_EVIDENCE_CONTEXT_REQUIRED/);
    assert.throws(() => store.append({ ...evidence, action: 42 }), /AUDIT_EVIDENCE_FIELDS_REQUIRED/);
    assert.throws(() => store.append({ ...evidence, occurredAt: "not-a-date" }), /AUDIT_EVIDENCE_TIMESTAMP_INVALID/);
    assert.equal(store.listByRequirement("tenant-a", "REQ-46305").length, 0);
  });
});

test("combined exception store preserves audit integrity and rejects duplicate IDs", () => {
  withStore(store => {
    const entry = store.append(evidence);
    assert.equal(store.verify(entry), true);
    assert.equal(store.verify({ ...entry, action: "EXCEPTION_DELETED" }), false);
    assert.throws(() => store.append(evidence), /AUDIT_EVIDENCE_ALREADY_EXISTS/);
    assert.equal(store.listByRequirement("tenant-a", "REQ-46305").length, 1);
  });
});
