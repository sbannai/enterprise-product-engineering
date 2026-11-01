import test from "node:test";
import assert from "node:assert/strict";
import { PostgresWorkflowOutboxStore } from "../dist/packages/workflows/postgres-workflow-outbox-store.js";

function poolFactory(rows = []) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("SELECT e.event_id")) return { rows, rowCount: rows.length };
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE", values: [] }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}

const row = {
  event_id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "tenant-a",
  application_id: "app-a",
  instance_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  transition_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  event_type: "workflow.instance.completed",
  event_version: 3,
  payload: { status: "complete" },
  occurred_at: "2026-11-01T03:00:00.000Z",
  attempts: 8,
  last_error: "receiver unavailable",
  updated_at: "2026-11-01T03:10:00.000Z",
};

test("dead-letter inspection is tenant/application scoped and maps event diagnostics", async () => {
  const { pool, calls } = poolFactory([row]);
  const result = await new PostgresWorkflowOutboxStore(pool).listDeadLetters(
    { tenantId: "tenant-a", applicationId: "app-a" }, 25,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].event.eventId, row.event_id);
  assert.equal(result[0].event.attempts, 8);
  assert.deepEqual(result[0].event.payload, { status: "complete" });
  assert.equal(result[0].lastError, "receiver unavailable");
  assert.equal(result[0].updatedAt, "2026-11-01T03:10:00.000Z");
  assert.ok(calls.some(call => call.sql.includes("set_config('eper.tenant_id'") &&
    call.values[0] === "tenant-a"));
  assert.ok(calls.some(call => call.sql.includes("set_config('eper.application_id'") &&
    call.values[0] === "app-a"));
  const query = calls.find(call => call.sql.includes("SELECT e.event_id"));
  assert.match(query.sql, /delivery_status = 'dead_letter'/);
  assert.match(query.sql, /ORDER BY d.updated_at ASC, d.event_id ASC/);
  assert.deepEqual(query.values, ["tenant-a", "app-a", 25]);
  assert.ok(calls.some(call => call.sql === "COMMIT"));
  assert.equal(calls.at(-1).sql, "RELEASE");
});

test("dead-letter inspection rejects unsafe limits before opening a database connection", async () => {
  const { pool, calls } = poolFactory();
  const store = new PostgresWorkflowOutboxStore(pool);
  for (const limit of [0, -1, 201, 1.5, Number.NaN]) {
    await assert.rejects(
      () => store.listDeadLetters({ tenantId: "tenant-a", applicationId: "app-a" }, limit),
      /WORKFLOW_OUTBOX_DEAD_LETTER_LIMIT_INVALID/,
    );
  }
  assert.equal(calls.length, 0);
});

test("dead-letter inspection rolls back on query failure", async () => {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("SELECT e.event_id")) throw new Error("database unavailable");
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE", values: [] }); },
  };
  const pool = { async connect() { return client; } };
  await assert.rejects(
    () => new PostgresWorkflowOutboxStore(pool).listDeadLetters(
      { tenantId: "tenant-a", applicationId: "app-a" },
    ),
    /database unavailable/,
  );
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.equal(calls.at(-1).sql, "RELEASE");
});
