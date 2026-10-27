import test from "node:test";
import assert from "node:assert/strict";
import { PostgresCampaignSchedulerStore } from "../dist/packages/campaign-scheduler/postgres-campaign-scheduler-store.js";

function fakePool(onQuery = async () => ({ rows: [], rowCount: 0 })) {
  const calls = [];
  const client = {
    async query(sql, values = []) { calls.push({ sql, values }); return onQuery(sql, values); },
    release() {},
  };
  return { calls, pool: { async connect() { return client; } } };
}
const now = Date.now();
function scheduleRow(overrides = {}) {
  return {
    id: "c7d2a1a8-6a54-4ec4-a1cb-1a31e8b43c31",
    tenant_id: "tenant-a", application_id: "app-a", campaign_id: "campaign-a",
    trigger_type: "once", timezone: "Asia/Kolkata", schedule_definition: { at: "2030-01-01T10:00:00+05:30" },
    approval_status: "pending", status: "draft", next_run_at: null,
    created_by: "actor-a", updated_by: "actor-a",
    created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(), ...overrides,
  };
}

test("schedule creation is tenant-scoped and starts as draft pending approval", async () => {
  const { pool, calls } = fakePool(async (sql) => ({ rows: sql.includes("INSERT INTO eper_campaign_schedules") ? [scheduleRow()] : [], rowCount: 1 }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const result = await store.createSchedule({
    tenantId: "tenant-a", applicationId: "app-a", campaignId: "campaign-a",
    triggerType: "once", timezone: "Asia/Kolkata", scheduleDefinition: { at: "2030-01-01T10:00:00+05:30" }, createdBy: "actor-a",
  });
  assert.equal(result.status, "draft");
  assert.equal(result.approvalStatus, "pending");
  assert.match(calls[0].sql, /tenant_id, application_id, campaign_id/);
  assert.equal(calls[0].values[1], "tenant-a");
});

test("schedule creation rejects malformed timezone before database access", async () => {
  const { pool, calls } = fakePool();
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(store.createSchedule({
    tenantId: "tenant-a", applicationId: "app-a", campaignId: "campaign-a",
    triggerType: "once", timezone: "Bad Timezone!", scheduleDefinition: {}, createdBy: "actor-a",
  }), /CAMPAIGN_TIMEZONE_INVALID/);
  assert.equal(calls.length, 0);
});

test("approval requires a future next-run time", async () => {
  const { pool, calls } = fakePool();
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(store.approveAndSchedule({
    tenantId: "tenant-a", applicationId: "app-a", scheduleId: "schedule-1",
    actorId: "actor-a", nextRunAt: new Date(Date.now() - 60_000).toISOString(),
  }), /CAMPAIGN_NEXT_RUN_MUST_BE_FUTURE/);
  assert.equal(calls.length, 0);
});

test("worker claim uses SKIP LOCKED and caps batch size", async () => {
  const { pool, calls } = fakePool();
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(store.claimExecutions("worker-a", 101), /CAMPAIGN_CLAIM_LIMIT_INVALID/);
  assert.equal(calls.length, 0);
  await store.claimExecutions("worker-a", 5);
  assert.match(calls[0].sql, /FOR UPDATE(?: OF e)? SKIP LOCKED/);
  assert.match(calls[0].sql, /attempt_count=e\.attempt_count\+1/);
  assert.deepEqual(calls[0].values, ["worker-a", 5]);
});

test("enqueue accepts only approved scheduled tenant/application schedules and is idempotent", async () => {
  const { pool, calls } = fakePool(async (sql) => ({ rows: sql.includes("INSERT INTO eper_campaign_executions") ? [{
    id: "job-1", schedule_id: "schedule-1", tenant_id: "tenant-a", application_id: "app-a",
    scheduled_for: new Date("2030-01-01T00:00:00Z"), status: "queued", attempt_count: 0,
    idempotency_key: "campaign:schedule-1:2030-01-01T00:00:00.000Z", payload: { safe: true },
    available_at: new Date("2030-01-01T00:00:00Z"),
  }] : [], rowCount: 1 }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const job = await store.enqueueExecution({
    tenantId: "tenant-a", applicationId: "app-a", scheduleId: "schedule-1",
    scheduledFor: "2030-01-01T00:00:00Z", idempotencyKey: "campaign:schedule-1:2030-01-01T00:00:00.000Z",
    payload: { safe: true },
  });
  assert.equal(job?.id, "job-1");
  assert.match(calls[0].sql, /s\.status='scheduled' AND s\.approval_status='approved'/);
  assert.match(calls[0].sql, /ON CONFLICT \(tenant_id, application_id, idempotency_key\)/);
});


test("failure uses bounded exponential retry policy and returns dead-letter at max attempts", async () => {
  const outcomes = [{ status: "retry_wait" }, { status: "dead_letter" }];
  const { pool, calls } = fakePool(async (sql) => ({ rows: sql.includes("UPDATE eper_campaign_executions") ? [outcomes.shift()] : [], rowCount: 1 }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const first = await store.failExecution({
    tenantId: "tenant-a", applicationId: "app-a", executionId: "job-1", workerId: "worker-a", errorCode: "provider_timeout",
  });
  assert.equal(first, "retry_wait");
  assert.match(calls[0].sql, /power\(2, GREATEST\(attempt_count - 1, 0\)\)/);
  assert.equal(calls[0].values[5], "PROVIDER_TIMEOUT");
  const second = await store.failExecution({
    tenantId: "tenant-a", applicationId: "app-a", executionId: "job-1", workerId: "worker-a", errorCode: "provider_timeout",
  });
  assert.equal(second, "dead_letter");
});

test("execution completion requires the current worker lease", async () => {
  const { pool, calls } = fakePool(async () => ({ rows: [], rowCount: 0 }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const completed = await store.completeExecution({
    tenantId: "tenant-a", applicationId: "app-a", executionId: "job-1", workerId: "worker-a", result: { delivered: true },
  });
  assert.equal(completed, false);
  assert.match(calls[0].sql, /status='running' AND locked_by=\$4/);
});

test("stale worker recovery validates policy and requeues or dead-letters expired leases", async () => {
  const { pool, calls } = fakePool(async () => ({ rows: [], rowCount: 3 }));
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(store.recoverStaleExecutions(5, 5), /CAMPAIGN_RECOVERY_POLICY_INVALID/);
  assert.equal(calls.length, 0);
  const recovered = await store.recoverStaleExecutions(300, 5);
  assert.equal(recovered, 3);
  assert.match(calls[0].sql, /WORKER_LEASE_EXPIRED/);
  assert.match(calls[0].sql, /status='running' AND locked_at < now\(\)/);
});


test("due one-time schedules are materialized atomically with stable idempotency keys", async () => {
  const { pool, calls } = fakePool(async (sql) => ({ rows: sql.includes("materialized_count") ? [{ materialized_count: 2 }] : [], rowCount: 2 }));
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(store.materializeDueOneTimeSchedules(0), /CAMPAIGN_MATERIALIZE_LIMIT_INVALID/);
  assert.equal(calls.length, 0);
  const count = await store.materializeDueOneTimeSchedules(25);
  assert.equal(count, 2);
  assert.match(calls[0].sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(calls[0].sql, /trigger_type='once' AND next_run_at <= now\(\)/);
  assert.match(calls[0].sql, /ON CONFLICT \(tenant_id, application_id, idempotency_key\) DO NOTHING/);
});


test("recurring schedules require a bounded interval", async () => {
  const { pool, calls } = fakePool();
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(store.createSchedule({
    tenantId: "tenant-a", applicationId: "app-a", campaignId: "campaign-a",
    triggerType: "recurring", timezone: "Asia/Kolkata", scheduleDefinition: { intervalSeconds: 5 }, createdBy: "actor-a",
  }), /CAMPAIGN_RECURRING_INTERVAL_SECONDS_INVALID/);
  assert.equal(calls.length, 0);
});

test("recurring materialization is concurrency-safe and advances missed intervals", async () => {
  const { pool, calls } = fakePool(async (sql) => ({ rows: sql.includes("materialized_count") ? [{ materialized_count: 1 }] : [], rowCount: 1 }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const count = await store.materializeDueRecurringSchedules(10);
  assert.equal(count, 1);
  assert.match(calls[0].sql, /trigger_type='recurring' AND next_run_at <= now\(\)/);
  assert.match(calls[0].sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(calls[0].sql, /interval_seconds/);
  assert.match(calls[0].sql, /ON CONFLICT \(tenant_id, application_id, idempotency_key\) DO NOTHING/);
});


test("event trigger fan-out is tenant/application scoped and idempotent", async () => {
  const { pool, calls } = fakePool(async (sql) => ({ rows: sql.includes("RETURNING id") ? [{ id: "execution-1" }] : [], rowCount: 1 }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const count = await store.enqueueEventExecutions({
    tenantId: "tenant-a", applicationId: "app-a", eventType: "lead.created",
    eventId: "evt-123", occurredAt: "2026-10-27T03:30:00.000Z",
    payload: { leadId: "lead-9" },
  });
  assert.equal(count, 1);
  assert.match(calls[0].sql, /s\.tenant_id=\$1 AND s\.application_id=\$2/);
  assert.match(calls[0].sql, /trigger_type='event'/);
  assert.match(calls[0].sql, /schedule_definition->>'eventType'=\$5/);
  assert.match(calls[0].sql, /ON CONFLICT \(tenant_id, application_id, idempotency_key\) DO NOTHING/);
  assert.equal(calls[0].values[3], "evt-123");
  assert.equal(calls[0].values[4], "lead.created");
});

test("event trigger rejects invalid occurrence timestamp before database access", async () => {
  const { pool, calls } = fakePool();
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(store.enqueueEventExecutions({
    tenantId: "tenant-a", applicationId: "app-a", eventType: "lead.created",
    eventId: "evt-123", occurredAt: "not-a-date",
  }), /CAMPAIGN_EVENT_OCCURRED_AT_INVALID/);
  assert.equal(calls.length, 0);
});


test("dispatch authorization re-reads current schedule approval and worker lease in tenant scope", async () => {
  const { pool, calls } = fakePool(async (sql) => ({
    rows: sql.includes("AS authorized") ? [{ authorized: true }] : [],
    rowCount: 1,
  }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const authorized = await store.isExecutionAuthorizedForDispatch({
    tenantId: "tenant-a", applicationId: "app-a", executionId: "job-1", workerId: "worker-a",
  });
  assert.equal(authorized, true);
  assert.match(calls[0].sql, /s\.status='scheduled' AND s\.approval_status='approved'/);
  assert.match(calls[0].sql, /e\.status='running' AND e\.locked_by=\$4/);
  assert.match(calls[0].sql, /WHERE e\.tenant_id=\$1 AND e\.application_id=\$2 AND e\.id=\$3/);
  assert.deepEqual(calls[0].values, ["tenant-a", "app-a", "job-1", "worker-a"]);
});

test("dispatch authorization denies when current schedule is paused or approval is revoked", async () => {
  const { pool } = fakePool(async (sql) => ({
    rows: sql.includes("AS authorized") ? [{ authorized: false }] : [],
    rowCount: 1,
  }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const authorized = await store.isExecutionAuthorizedForDispatch({
    tenantId: "tenant-a", applicationId: "app-a", executionId: "job-1", workerId: "worker-a",
  });
  assert.equal(authorized, false);
});
