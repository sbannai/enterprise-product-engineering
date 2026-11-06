import test from "node:test";
import assert from "node:assert/strict";
import { PostgresWorkflowOutboxStore } from "../dist/packages/workflows/postgres-workflow-outbox-store.js";

const context = { tenantId: "tenant-a", applicationId: "app-a" };
const eventId = "11111111-1111-4111-8111-111111111111";
const workerId = "worker-a";
const claimToken = "17";
const leaseSeconds = 60;

function makePool(updateRows = []) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("UPDATE eper_workflow_outbox_delivery")) {
        return { rows: updateRows, rowCount: updateRows.length };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  return { calls, pool: { async connect() { return client; } } };
}

test("renewLease requires the exact claim generation and a live DB-clock lease", async () => {
  const { pool, calls } = makePool([]);
  const renewed = await new PostgresWorkflowOutboxStore(pool).renewLease(
    context, eventId, workerId, claimToken, leaseSeconds,
  );
  assert.equal(renewed, false);
  const update = calls.find(call => call.sql.includes("UPDATE eper_workflow_outbox_delivery"));
  assert.match(update.sql, /claim_version = \$5::bigint/);
  assert.match(update.sql, /locked_at > clock_timestamp\(\) - \(\$6::int \* INTERVAL '1 second'\)/);
  assert.deepEqual(update.values, ["tenant-a", "app-a", eventId, workerId, claimToken, leaseSeconds]);
});

test("markDelivered refuses a stale claim even when the worker ID matches", async () => {
  const { pool, calls } = makePool([]);
  await assert.rejects(
    () => new PostgresWorkflowOutboxStore(pool).markDelivered(
      context, eventId, workerId, claimToken, leaseSeconds,
    ),
    /WORKFLOW_OUTBOX_LEASE_NOT_HELD/,
  );
  const update = calls.find(call => call.sql.includes("UPDATE eper_workflow_outbox_delivery"));
  assert.match(update.sql, /claim_version = \$5::bigint/);
  assert.match(update.sql, /locked_at > clock_timestamp\(\) - \(\$6::int \* INTERVAL '1 second'\)/);
  assert.deepEqual(update.values, ["tenant-a", "app-a", eventId, workerId, claimToken, leaseSeconds]);
});

test("markFailed refuses a stale claim and does not overwrite a newer attempt", async () => {
  const { pool, calls } = makePool([]);
  await assert.rejects(
    () => new PostgresWorkflowOutboxStore(pool).markFailed(context, eventId, {
      workerId, claimToken, leaseSeconds, maxAttempts: 8, retryDelaySeconds: 5,
      error: "late failure from stale attempt",
    }),
    /WORKFLOW_OUTBOX_LEASE_NOT_HELD/,
  );
  const update = calls.find(call => call.sql.includes("UPDATE eper_workflow_outbox_delivery"));
  assert.match(update.sql, /claim_version = \$8::bigint/);
  assert.match(update.sql, /locked_at > clock_timestamp\(\) - \(\$9::int \* INTERVAL '1 second'\)/);
  assert.deepEqual(update.values, [
    "tenant-a", "app-a", eventId, "late failure from stale attempt", 8, 5,
    workerId, claimToken, leaseSeconds,
  ]);
});

test("markDelivered accepts only the supplied live claim generation", async () => {
  const { pool, calls } = makePool([{ event_id: eventId }]);
  await new PostgresWorkflowOutboxStore(pool).markDelivered(
    context, eventId, workerId, claimToken, leaseSeconds,
  );
  assert.ok(calls.some(call => call.sql === "COMMIT"));
});
