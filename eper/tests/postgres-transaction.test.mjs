import test from "node:test";
import assert from "node:assert/strict";
import {
  withTenantTransaction,
  enqueueOutboxEvent,
  claimPendingOutboxEvents,
  markOutboxDelivered,
} from "../dist/packages/capabilities/postgres-transaction.js";

function fakePool({ failAt } = {}) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql).replace(/\s+/g, " ").trim(), params });
      if (failAt && String(sql).includes(failAt)) throw new Error("INJECTED_DATABASE_FAILURE");
      if (/UPDATE transactional_outbox/.test(String(sql))) return { rowCount: 1, rows: [] };
      if (/SELECT event_id/.test(String(sql))) return { rowCount: 0, rows: [] };
      return { rowCount: null, rows: [] };
    },
    release() { calls.push({ sql: "RELEASE", params: [] }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}

test("tenant transaction establishes tenant context and commits successful unit of work", async () => {
  const { calls, pool } = fakePool();
  const value = await withTenantTransaction(pool, "tenant-a", async tx => {
    assert.equal(tx.tenantId, "tenant-a");
    return "committed";
  });
  assert.equal(value, "committed");
  assert.equal(calls[0].sql, "BEGIN");
  assert.match(calls[1].sql, /set_config\('eper\.tenant_id'/);
  assert.deepEqual(calls[1].params, ["tenant-a"]);
  assert.equal(calls[2].sql, "COMMIT");
  assert.equal(calls.at(-1).sql, "RELEASE");
});

test("failed unit of work rolls back and preserves original error", async () => {
  const { calls, pool } = fakePool();
  await assert.rejects(
    withTenantTransaction(pool, "tenant-a", async () => { throw new Error("INJECTED_WORK_FAILURE"); }),
    /INJECTED_WORK_FAILURE/,
  );
  assert.equal(calls.at(-2).sql, "ROLLBACK");
  assert.equal(calls.at(-1).sql, "RELEASE");
});

test("outbox rejects cross-tenant event before issuing SQL", async () => {
  const { calls, pool } = fakePool();
  await withTenantTransaction(pool, "tenant-a", async tx => {
    await assert.rejects(enqueueOutboxEvent(tx, {
      eventId: "evt-1", tenantId: "tenant-b", aggregateType: "record",
      aggregateId: "rec-1", eventType: "RECORD_CREATED", correlationId: "corr-1", payload: {},
    }), /TENANT_CONTEXT_MISMATCH/);
  });
  assert.equal(calls.some(call => call.sql.includes("INSERT INTO transactional_outbox")), false);
});

test("outbox enqueue uses parameterized insert and tenant transaction", async () => {
  const { calls, pool } = fakePool();
  await withTenantTransaction(pool, "tenant-a", async tx => {
    await enqueueOutboxEvent(tx, {
      eventId: "evt-1", tenantId: "tenant-a", aggregateType: "record",
      aggregateId: "rec-1", eventType: "RECORD_CREATED", correlationId: "corr-1",
      payload: { recordId: "rec-1" },
    });
    await claimPendingOutboxEvents(tx, 25);
    await markOutboxDelivered(tx, "evt-1");
  });
  const insert = calls.find(call => call.sql.includes("INSERT INTO transactional_outbox"));
  assert.ok(insert);
  assert.equal(insert.params[0], "evt-1");
  assert.equal(insert.params[1], "tenant-a");
  assert.ok(calls.some(call => call.sql.includes("FOR UPDATE SKIP LOCKED")));
  assert.ok(calls.some(call => call.sql.includes("WHERE tenant_id = $1 AND event_id = $2")));
});

test("outbox claim limit is bounded", async () => {
  const { pool } = fakePool();
  await withTenantTransaction(pool, "tenant-a", async tx => {
    await assert.rejects(claimPendingOutboxEvents(tx, 1001), /OUTBOX_LIMIT_INVALID/);
  });
});
