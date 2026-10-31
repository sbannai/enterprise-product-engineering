import test from "node:test";
import assert from "node:assert/strict";
import { PostgresWorkflowOutboxContextSource } from "../dist/packages/workflows/postgres-workflow-outbox-context-source.js";

function poolFor(rows, options = {}) {
  const calls = [];
  let released = 0;
  return {
    calls,
    get released() { return released; },
    async connect() {
      return {
        async query(sql, values) {
          calls.push({ sql, values });
          if (options.error) throw options.error;
          return { rows, rowCount: rows.length };
        },
        release() { released += 1; },
      };
    },
  };
}

test("context source discovers only active tenant/application assignments in stable order with a hard cap", async () => {
  const pool = poolFor([
    { tenant_id: "tenant-a", application_id: "app-a" },
    { tenant_id: "tenant-b", application_id: "app-c" },
  ]);
  const source = new PostgresWorkflowOutboxContextSource(pool, 2);
  assert.deepEqual(await source.listActiveContexts(), [
    { tenantId: "tenant-a", applicationId: "app-a" },
    { tenantId: "tenant-b", applicationId: "app-c" },
  ]);
  assert.match(pool.calls[0].sql, /assignment_status = 'active'/);
  assert.match(pool.calls[0].sql, /ORDER BY tenant_id, application_id/);
  assert.deepEqual(pool.calls[0].values, [3]);
  assert.equal(pool.released, 1);
});

test("context source fails closed when the active-scope limit is exceeded", async () => {
  const pool = poolFor([
    { tenant_id: "tenant-a", application_id: "app-a" },
    { tenant_id: "tenant-b", application_id: "app-b" },
  ]);
  const source = new PostgresWorkflowOutboxContextSource(pool, 1);
  await assert.rejects(source.listActiveContexts(), /WORKFLOW_OUTBOX_CONTEXT_LIMIT_EXCEEDED/);
  assert.equal(pool.released, 1);
});

test("context source rejects malformed identity rows and releases its connection", async () => {
  const pool = poolFor([{ tenant_id: "tenant with spaces", application_id: "app-a" }]);
  const source = new PostgresWorkflowOutboxContextSource(pool);
  await assert.rejects(source.listActiveContexts(), /WORKFLOW_OUTBOX_CONTEXT_ROW_INVALID/);
  assert.equal(pool.released, 1);
});

test("context source propagates database failures and releases its connection", async () => {
  const pool = poolFor([], { error: new Error("database unavailable") });
  const source = new PostgresWorkflowOutboxContextSource(pool);
  await assert.rejects(source.listActiveContexts(), /database unavailable/);
  assert.equal(pool.released, 1);
});

test("context source does not query after shutdown has been requested", async () => {
  const pool = poolFor([]);
  const controller = new AbortController();
  controller.abort();
  const source = new PostgresWorkflowOutboxContextSource(pool);
  assert.deepEqual(await source.listActiveContexts(controller.signal), []);
  assert.equal(pool.calls.length, 0);
  assert.equal(pool.released, 0);
});

test("context source validates its configured scope limit", () => {
  const pool = poolFor([]);
  assert.throws(() => new PostgresWorkflowOutboxContextSource(pool, 0), /WORKFLOW_OUTBOX_CONTEXT_LIMIT_INVALID/);
  assert.throws(() => new PostgresWorkflowOutboxContextSource(pool, 10_001), /WORKFLOW_OUTBOX_CONTEXT_LIMIT_INVALID/);
});
