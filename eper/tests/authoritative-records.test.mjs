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

test("authoritative records isolate nested input and returned data", () => {
  const store = new InMemoryAuthoritativeRecordStore();
  const input = { nested: { labels: ["original"] } };
  const created = store.create({ id: "nested", tenantId: "tenant-a", version: 1, state: "ACTIVE", data: input });
  input.nested.labels.push("caller-change");
  created.data.nested.labels.push("returned-change");
  const fetched = store.get("tenant-a", "nested");
  fetched.data.nested.labels.push("fetch-change");
  assert.deepEqual(store.get("tenant-a", "nested").data, { nested: { labels: ["original"] } });
});

test("authoritative record composite keys cannot collide across tenant and record IDs", () => {
  const store = new InMemoryAuthoritativeRecordStore();
  store.create({ id: "c", tenantId: "a:b", version: 1, state: "ACTIVE", data: { value: 1 } });
  store.create({ id: "b:c", tenantId: "a", version: 1, state: "ACTIVE", data: { value: 2 } });
  assert.equal(store.get("a:b", "c").data.value, 1);
  assert.equal(store.get("a", "b:c").data.value, 2);
});

test("authoritative records reject circular data instead of storing partial evidence", () => {
  const store = new InMemoryAuthoritativeRecordStore();
  const circular = {};
  circular.self = circular;
  assert.throws(() => store.create({ id: "bad", tenantId: "tenant-a", version: 1, state: "ACTIVE", data: circular }), /RECORD_DATA_NOT_SERIALIZABLE/);
});

test("authoritative records reject malformed runtime context, versions, and data", () => {
  const store = new InMemoryAuthoritativeRecordStore();
  assert.throws(
    () => store.create({ id: "", tenantId: "tenant-a", version: 1, state: "ACTIVE", data: {} }),
    /RECORD_CONTEXT_REQUIRED/,
  );
  assert.throws(
    () => store.create({ id: "bad-version", tenantId: "tenant-a", version: 0, state: "ACTIVE", data: {} }),
    /RECORD_VERSION_INVALID/,
  );
  assert.throws(
    () => store.create({ id: "bad-data", tenantId: "tenant-a", version: 1, state: "ACTIVE", data: [] }),
    /RECORD_DATA_INVALID/,
  );
  assert.equal(store.get("tenant-a", "bad-version"), undefined);
  assert.equal(store.get("tenant-a", "bad-data"), undefined);
});

test("authoritative record updates reject malformed runtime versions, patches, and data", () => {
  const store = new InMemoryAuthoritativeRecordStore();
  store.create({ id: "update-guard", tenantId: "tenant-a", version: 1, state: "ACTIVE", data: { safe: true } });

  assert.throws(
    () => store.update("tenant-a", "update-guard", 0, { state: "REVISED" }),
    /RECORD_VERSION_INVALID/,
  );
  assert.throws(
    () => store.update("tenant-a", "update-guard", 1, { data: [] }),
    /RECORD_DATA_INVALID/,
  );
  assert.throws(
    () => store.update("tenant-a", "update-guard", 1, { state: " " }),
    /RECORD_STATE_INVALID/,
  );

  const unchanged = store.get("tenant-a", "update-guard");
  assert.equal(unchanged.version, 1);
  assert.equal(unchanged.state, "ACTIVE");
  assert.deepEqual(unchanged.data, { safe: true });
});

test("authoritative record delete rejects invalid runtime versions without deleting the record", () => {
  const store = new InMemoryAuthoritativeRecordStore();
  store.create({ id: "delete-guard", tenantId: "tenant-a", version: 1, state: "ACTIVE", data: { safe: true } });

  assert.throws(
    () => store.delete("tenant-a", "delete-guard", 0),
    /RECORD_VERSION_INVALID/,
  );
  assert.deepEqual(store.get("tenant-a", "delete-guard"), {
    id: "delete-guard",
    tenantId: "tenant-a",
    version: 1,
    state: "ACTIVE",
    data: { safe: true },
  });
});
