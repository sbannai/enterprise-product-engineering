import test from "node:test";
import assert from "node:assert/strict";
import { replayWorkflowOutboxDeadLetter } from "../dist/packages/workflows/workflow-outbox-dead-letter-replay.js";

const context = { tenantId: "tenant-a", applicationId: "app-a", actorId: "operator-1", correlationId: "corr-001", environment: "sandbox" };
const input = {
  eventId: "123e4567-e89b-42d3-a456-426614174000",
  workerId: "operator-console",
  reason: "Provider endpoint recovered; replay requested under incident INC-42",
  idempotencyKey: "replay-request-0001",
};

function mockPool({ authorized = true, deadLetter = true, prior = null } = {}) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("FROM eper_workflow_actor_role_assignment")) {
        return { rows: authorized ? [{ role_id: "workflow-admin" }] : [], rowCount: authorized ? 1 : 0 };
      }
      if (sql.includes("FROM eper_workflow_outbox_replay_audit")) {
        return { rows: prior ? [prior] : [], rowCount: prior ? 1 : 0 };
      }
      if (sql.includes("FROM eper_workflow_outbox_delivery") && sql.includes("FOR UPDATE")) {
        return { rows: deadLetter ? [{ attempts: 8, last_error: "provider unavailable" }] : [], rowCount: deadLetter ? 1 : 0 };
      }
      if (sql.includes("INSERT INTO eper_workflow_outbox_replay_audit")) return { rows: [], rowCount: 1 };
      if (sql.includes("INSERT INTO eper_audit_events")) return { rows: [], rowCount: 1 };
      if (sql.includes("UPDATE eper_workflow_outbox_delivery")) return { rows: [{ event_id: input.eventId }], rowCount: 1 };
      if (sql.includes("SELECT last_event_hash")) return { rows: [{ last_event_hash: null }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE", values: [] }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}

test("dead-letter replay requires admin authorization and tenant-scoped RLS", async () => {
  const { pool, calls } = mockPool();
  const result = await replayWorkflowOutboxDeadLetter(pool, context, input);
  assert.equal(result.eventId, input.eventId);
  assert.equal(result.priorAttempts, 8);
  assert.equal(result.alreadyApplied, false);
  assert.ok(calls.some(c => c.sql.includes("set_config('eper.tenant_id'")));
  assert.ok(calls.some(c => c.sql.includes("rd.permissions ? 'workflow:admin'")));
  assert.ok(calls.some(c => c.sql.includes("INSERT INTO eper_workflow_outbox_replay_audit")));
  assert.ok(calls.some(c => c.sql.includes("INSERT INTO eper_audit_events")));
  const update = calls.find(c => c.sql.includes("UPDATE eper_workflow_outbox_delivery"));
  assert.match(update.sql, /delivery_status = 'dead_letter'/);
  assert.doesNotMatch(update.sql, /attempts\s*=/);
  assert.ok(calls.some(c => c.sql === "COMMIT"));
  assert.equal(calls.at(-1).sql, "RELEASE");
});

test("dead-letter replay denies actors without workflow admin", async () => {
  const { pool, calls } = mockPool({ authorized: false });
  await assert.rejects(
    () => replayWorkflowOutboxDeadLetter(pool, context, input),
    /WORKFLOW_OUTBOX_REPLAY_PERMISSION_DENIED/,
  );
  assert.ok(!calls.some(c => c.sql.includes("INSERT INTO eper_workflow_outbox_replay_audit")));
  assert.ok(calls.some(c => c.sql === "ROLLBACK"));
});

test("dead-letter replay rejects non-dead-letter events without audit side effects", async () => {
  const { pool, calls } = mockPool({ deadLetter: false });
  await assert.rejects(
    () => replayWorkflowOutboxDeadLetter(pool, context, input),
    /WORKFLOW_OUTBOX_REPLAY_NOT_DEAD_LETTERED/,
  );
  assert.ok(!calls.some(c => c.sql.includes("INSERT INTO eper_audit_events")));
  assert.ok(calls.some(c => c.sql === "ROLLBACK"));
});

test("dead-letter replay is idempotent for a repeated key and same event", async () => {
  const prior = { replay_id: "223e4567-e89b-42d3-a456-426614174000", event_id: input.eventId, prior_attempts: 8 };
  const { pool, calls } = mockPool({ prior });
  const result = await replayWorkflowOutboxDeadLetter(pool, context, input);
  assert.deepEqual(result, {
    replayId: prior.replay_id, eventId: input.eventId, priorAttempts: 8, alreadyApplied: true,
  });
  assert.ok(!calls.some(c => c.sql.includes("UPDATE eper_workflow_outbox_delivery")));
});

test("dead-letter replay rejects an idempotency key reused for another event", async () => {
  const prior = { replay_id: "223e4567-e89b-42d3-a456-426614174000", event_id: "323e4567-e89b-42d3-a456-426614174000", prior_attempts: 8 };
  const { pool } = mockPool({ prior });
  await assert.rejects(
    () => replayWorkflowOutboxDeadLetter(pool, context, input),
    /WORKFLOW_OUTBOX_REPLAY_IDEMPOTENCY_CONFLICT/,
  );
});

test("dead-letter replay validates reason and idempotency key before connecting", async () => {
  const { pool, calls } = mockPool();
  await assert.rejects(
    () => replayWorkflowOutboxDeadLetter(pool, context, { ...input, reason: " " }),
    /WORKFLOW_OUTBOX_REPLAY_REASON_REQUIRED/,
  );
  await assert.rejects(
    () => replayWorkflowOutboxDeadLetter(pool, context, { ...input, idempotencyKey: "short" }),
    /WORKFLOW_OUTBOX_REPLAY_IDEMPOTENCY_KEY_INVALID/,
  );
  assert.equal(calls.length, 0);
});
