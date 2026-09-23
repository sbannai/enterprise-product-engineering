import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryAuthoritativeRecordStore } from "../dist/packages/capabilities/authoritative-records.js";

test("authoritative records are isolated by tenant", () => {
  const store = new InMemoryAuthoritativeRecordStore();
  store.create({ id: "r1", tenantId: "tenant-a", version: 1, state: "ACTIVE", data: { value: 1 } });
  store.create({ id: "r1", tenantId: "tenant-b", version: 1, state: "ACTIVE", data: { value: 2 } });

  assert.equal(store.get("tenant-a", "r1")?.data.value, 1);
  assert.equal(store.get("tenant-b", "r1")?.data.value, 2);
});

test("authoritative records enforce optimistic version control", () => {
  const store = new InMemoryAuthoritativeRecordStore();
  store.create({ id: "r1", tenantId: "tenant-a", version: 1, state: "ACTIVE", data: { value: 1 } });

  const updated = store.update("tenant-a", "r1", 1, { state: "REVISED", data: { value: 2 } });
  assert.equal(updated.version, 2);
  assert.equal(updated.state, "REVISED");

  assert.throws(
    () => store.update("tenant-a", "r1", 1, { state: "STALE" }),
    /RECORD_VERSION_CONFLICT/,
  );
});

test("authoritative records reject duplicate creation and missing records", () => {
  const store = new InMemoryAuthoritativeRecordStore();
  store.create({ id: "r1", tenantId: "tenant-a", version: 1, state: "ACTIVE", data: {} });

  assert.throws(
    () => store.create({ id: "r1", tenantId: "tenant-a", version: 1, state: "ACTIVE", data: {} }),
    /RECORD_ALREADY_EXISTS/,
  );
  assert.throws(
    () => store.update("tenant-a", "missing", 1, { state: "ACTIVE" }),
    /RECORD_NOT_FOUND/,
  );
});
