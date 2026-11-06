import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileAuthoritativeRecordStore } from "../dist/packages/capabilities/json-file-authoritative-record-store.js";

test("JSON file store survives adapter recreation and preserves tenant isolation", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-record-store-"));
  const file = join(directory, "records.json");
  try {
    const first = new JsonFileAuthoritativeRecordStore(file);
    first.create({ id: "record-1", tenantId: "tenant-a", version: 1, state: "OPEN", data: { nested: { value: 1 } } });
    first.create({ id: "record-1", tenantId: "tenant-b", version: 1, state: "OPEN", data: { value: "other" } });

    const recreated = new JsonFileAuthoritativeRecordStore(file);
    assert.equal(recreated.get("tenant-a", "record-1")?.data.nested.value, 1);
    assert.equal(recreated.get("tenant-b", "record-1")?.data.value, "other");
    assert.equal(recreated.get("tenant-c", "record-1"), undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("JSON file store persists versioned updates and rejects stale writes", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-record-store-"));
  const file = join(directory, "records.json");
  try {
    const store = new JsonFileAuthoritativeRecordStore(file);
    store.create({ id: "record-2", tenantId: "tenant-a", version: 1, state: "OPEN", data: { value: 1 } });
    const updated = store.update("tenant-a", "record-2", 1, { state: "CLOSED", data: { value: 2 } });
    assert.equal(updated.version, 2);
    assert.equal(new JsonFileAuthoritativeRecordStore(file).get("tenant-a", "record-2")?.state, "CLOSED");
    assert.throws(() => store.update("tenant-a", "record-2", 1, { state: "REOPENED" }), /RECORD_VERSION_CONFLICT/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
