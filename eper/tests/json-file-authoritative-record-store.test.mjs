import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileAuthoritativeRecordStore } from "../dist/packages/capabilities/json-file-authoritative-record-store.js";

function withStore(run) {
  const directory = mkdtempSync(join(tmpdir(), "eper-record-store-"));
  const filePath = join(directory, "records.json");
  try { run(new JsonFileAuthoritativeRecordStore(filePath), filePath); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

const record = {
  id: "record-1", tenantId: "tenant-a", version: 1, state: "DRAFT",
  data: { nested: { labels: ["original"] } },
};

test("JSON record store rejects malformed create context, version and data", () => {
  withStore(store => {
    assert.throws(() => store.create(null), /RECORD_CONTEXT_REQUIRED/);
    assert.throws(() => store.create({ ...record, tenantId: 7 }), /RECORD_CONTEXT_REQUIRED/);
    assert.throws(() => store.create({ ...record, version: 0 }), /RECORD_VERSION_INVALID/);
    assert.throws(() => store.create({ ...record, data: [] }), /RECORD_DATA_INVALID/);
    assert.equal(store.get("tenant-a", "record-1"), undefined);
  });
});

test("JSON record store validates updates and uses optimistic version checks", () => {
  withStore(store => {
    store.create(record);
    assert.throws(() => store.update("tenant-a", "record-1", 0, { state: "ACTIVE" }), /RECORD_EXPECTED_VERSION_INVALID/);
    assert.throws(() => store.update("tenant-a", "record-1", 1, null), /RECORD_PATCH_INVALID/);
    assert.throws(() => store.update("tenant-a", "record-1", 1, { state: " " }), /RECORD_STATE_INVALID/);
    assert.throws(() => store.update("tenant-a", "record-1", 1, { data: [] }), /RECORD_DATA_INVALID/);
    const updated = store.update("tenant-a", "record-1", 1, { state: "ACTIVE" });
    assert.equal(updated.version, 2);
    assert.equal(updated.state, "ACTIVE");
    assert.throws(() => store.update("tenant-a", "record-1", 1, { state: "CLOSED" }), /RECORD_VERSION_CONFLICT/);
  });
});

test("JSON record store rejects malformed persisted rows", () => {
  withStore((store, filePath) => {
    writeFileSync(filePath, JSON.stringify([{ ...record, version: "1" }]));
    assert.throws(() => store.get("tenant-a", "record-1"), /PERSISTENCE_DATA_INVALID/);
    assert.throws(() => store.create({ ...record, id: "record-2" }), /PERSISTENCE_DATA_INVALID/);
  });
});

test("JSON record store isolates tenants and deep-clones record data", () => {
  withStore(store => {
    const input = structuredClone(record);
    const created = store.create(input);
    input.data.nested.labels.push("input-change");
    created.data.nested.labels.push("returned-change");
    assert.deepEqual(store.get("tenant-a", "record-1").data, { nested: { labels: ["original"] } });
    assert.equal(store.get("tenant-b", "record-1"), undefined);
    store.create({ ...record, tenantId: "tenant-b" });
    assert.equal(store.get("tenant-b", "record-1").tenantId, "tenant-b");
  });
});


test("JSON record store rejects duplicate persisted tenant-scoped record IDs", () => {
  withStore((store, filePath) => {
    writeFileSync(filePath, JSON.stringify([record, record]));
    assert.throws(() => store.get("tenant-a", "record-1"), /PERSISTENCE_DATA_INVALID/);
  });
});
