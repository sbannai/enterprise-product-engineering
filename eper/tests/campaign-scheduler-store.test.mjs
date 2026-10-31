import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PostgresCampaignSchedulerStore } from "../dist/packages/campaign-scheduler/postgres-campaign-scheduler-store.js";

function fakePool(onQuery = async () => ({ rows: [], rowCount: 0 })) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      const result = await onQuery(sql, values);
      if (sql.includes("SELECT last_event_hash FROM eper_audit_chain_head") && result.rows.length === 0) {
        return { rows: [{ last_event_hash: null }], rowCount: 1 };
      }
      return result;
    },
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
  const insert = calls.find((call) => call.sql.includes("INSERT INTO eper_campaign_schedules"));
  assert.ok(insert);
  assert.match(insert.sql, /tenant_id, application_id, campaign_id/);
  assert.equal(insert.values[1], "tenant-a");
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

test("schedule creation rejects unknown but syntactically valid timezone before database access", async () => {
  const { pool, calls } = fakePool();
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(store.createSchedule({
    tenantId: "tenant-a", applicationId: "app-a", campaignId: "campaign-a",
    triggerType: "once", timezone: "Mars/Olympus", scheduleDefinition: {}, createdBy: "actor-a",
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
  const claim = calls.find((call) => call.sql.includes("WITH due AS"));
  assert.ok(claim);
  assert.match(claim.sql, /FOR UPDATE(?: OF e)? SKIP LOCKED/);
  assert.match(claim.sql, /attempt_count=e\.attempt_count\+1/);
  assert.deepEqual(claim.values, ["worker-a", 5]);
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
  const outcomes = [
    { status: "retry_wait", last_error_code: "PROVIDER_TIMEOUT", last_error_detail_code: null, attempt_count: 1 },
    { status: "dead_letter", last_error_code: "PROVIDER_TIMEOUT", last_error_detail_code: null, attempt_count: 5 },
  ];
  const { pool, calls } = fakePool(async (sql) => ({ rows: sql.includes("UPDATE eper_campaign_executions") ? [outcomes.shift()] : [], rowCount: 1 }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const first = await store.failExecution({
    tenantId: "tenant-a", applicationId: "app-a", executionId: "job-1", workerId: "worker-a", errorCode: "provider_timeout",
  });
  assert.equal(first, "retry_wait");
  assert.match(calls.find((call) => call.sql.includes("UPDATE eper_campaign_executions")).sql, /power\(2, GREATEST\(attempt_count - 1, 0\)\)/);
  assert.equal(calls.find((call) => call.sql.includes("UPDATE eper_campaign_executions")).values[5], "PROVIDER_TIMEOUT");
  const second = await store.failExecution({
    tenantId: "tenant-a", applicationId: "app-a", executionId: "job-1", workerId: "worker-a", errorCode: "provider_timeout",
  });
  assert.equal(second, "dead_letter");
  assert.equal(calls.filter((call) => call.sql.includes("INSERT INTO eper_audit_events")).length, 2);
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
});

test("execution completion requires the current worker lease", async () => {
  const { pool, calls } = fakePool(async () => ({ rows: [], rowCount: 0 }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const completed = await store.completeExecution({
    tenantId: "tenant-a", applicationId: "app-a", executionId: "job-1", workerId: "worker-a", result: { delivered: true },
  });
  assert.equal(completed, false);
  const update = calls.find((call) => call.sql.includes("UPDATE eper_campaign_executions"));
  assert.ok(update);
  assert.match(update.sql, /status='running' AND locked_by=\$4/);
  assert.match(update.sql, /last_error_code=NULL, last_error_detail_code=NULL/);
});

test("successful execution completion appends a transactional audit event", async () => {
  const { pool, calls } = fakePool(async (sql) => ({
    rows: sql.includes("RETURNING id, attempt_count") ? [{ id: "job-1", attempt_count: 2 }] : [],
    rowCount: sql.includes("UPDATE eper_campaign_executions") ? 1 : 0,
  }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const completed = await store.completeExecution({
    tenantId: "tenant-a", applicationId: "app-a", executionId: "job-1",
    workerId: "worker-a", result: { delivered: true },
  });
  assert.equal(completed, true);
  assert.equal(calls[0].sql, "BEGIN");
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.ok(calls.some((call) => call.sql === "COMMIT"), "cancellation transaction must commit before the later denied fence transaction rolls back");
});

test("successful completion rolls back if its audit event cannot be persisted", async () => {
  const { pool, calls } = fakePool(async (sql) => {
    if (sql.includes("INSERT INTO eper_audit_events")) throw new Error("audit storage unavailable");
    return { rows: sql.includes("RETURNING id, attempt_count") ? [{ id: "job-1", attempt_count: 1 }] : [], rowCount: 1 };
  });
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(store.completeExecution({
    tenantId: "tenant-a", applicationId: "app-a", executionId: "job-1", workerId: "worker-a",
  }), /CAMPAIGN_AUDIT_PERSISTENCE_FAILED/);
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(calls.some((call) => call.sql === "COMMIT"), false);
});

test("stale worker recovery validates policy and requeues or dead-letters expired leases", async () => {
  const { pool, calls } = fakePool(async (sql) => ({
    rows: sql.includes("UPDATE eper_campaign_executions") ? [
      { id: "exec-1", tenant_id: "tenant-a", application_id: "app-a", status: "retry_wait", last_error_code: "WORKER_LEASE_EXPIRED", last_error_detail_code: null, attempt_count: 2 },
      { id: "exec-2", tenant_id: "tenant-b", application_id: "app-b", status: "dead_letter", last_error_code: "DISPATCH_OUTCOME_UNKNOWN", last_error_detail_code: "WORKER_LEASE_EXPIRED", attempt_count: 5 },
      { id: "exec-3", tenant_id: "tenant-c", application_id: "app-c", status: "retry_wait", last_error_code: "WORKER_LEASE_EXPIRED", last_error_detail_code: null, attempt_count: 1 },
    ] : [], rowCount: sql.includes("UPDATE eper_campaign_executions") ? 3 : 1,
  }));
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(store.recoverStaleExecutions(5, 5), /CAMPAIGN_RECOVERY_POLICY_INVALID/);
  assert.equal(calls.length, 0);
  const recovered = await store.recoverStaleExecutions(300, 5);
  assert.equal(recovered, 3);
  const recoveryUpdate = calls.find((call) => call.sql.includes("UPDATE eper_campaign_executions"));
  assert.match(recoveryUpdate.sql, /WORKER_LEASE_EXPIRED/);
  assert.equal(calls.filter((call) => call.sql.includes("INSERT INTO eper_audit_events")).length, 3);
  assert.equal(calls.at(-1).sql, "COMMIT");
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
  assert.match(calls[0].sql, /'event:' \|\| \$7 \|\| ':' \|\| s\.id::text/);
  assert.equal(calls[0].values[6], createHash("sha256").update("lead.created").update("\0").update("evt-123").digest("hex"));
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
  assert.match(calls[0].sql, /\(s\.status='scheduled' OR \(s\.status='completed' AND s\.trigger_type='once'\)\)/);
  assert.match(calls[0].sql, /s\.approval_status='approved'/);
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


test("schedule listing is tenant/application scoped and pagination is bounded", async () => {
  const { pool, calls } = fakePool(async (sql) => ({ rows: sql.includes("SELECT * FROM eper_campaign_schedules") ? [scheduleRow()] : [], rowCount: 1 }));
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(store.listSchedules({ tenantId: "tenant-a", applicationId: "app-a", limit: 101 }), /CAMPAIGN_LIST_LIMIT_INVALID/);
  assert.equal(calls.length, 0);
  const rows = await store.listSchedules({ tenantId: "tenant-a", applicationId: "app-a", limit: 10, offset: 20 });
  assert.equal(rows.length, 1);
  assert.match(calls[0].sql, /WHERE tenant_id=\$1 AND application_id=\$2/);
  assert.deepEqual(calls[0].values, ["tenant-a", "app-a", 10, 20]);
});

test("schedule detail lookup returns no record outside the supplied tenant/application scope", async () => {
  const { pool, calls } = fakePool(async () => ({ rows: [], rowCount: 0 }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const row = await store.getSchedule({ tenantId: "tenant-b", applicationId: "app-b", scheduleId: "schedule-1" });
  assert.equal(row, null);
  assert.match(calls[0].sql, /WHERE tenant_id=\$1 AND application_id=\$2 AND id=\$3/);
  assert.deepEqual(calls[0].values, ["tenant-b", "app-b", "schedule-1"]);
});


test("schedule creation commits the mutation and audit event in one transaction", async () => {
  const { pool, calls } = fakePool(async (sql) => ({
    rows: sql.includes("INSERT INTO eper_campaign_schedules") ? [scheduleRow()] : [],
    rowCount: 1,
  }));
  const store = new PostgresCampaignSchedulerStore(pool);
  await store.createSchedule({
    tenantId: "tenant-a", applicationId: "app-a", campaignId: "campaign-a",
    triggerType: "once", timezone: "Asia/Kolkata",
    scheduleDefinition: { at: "2030-01-01T10:00:00+05:30" }, createdBy: "actor-a",
  });
  const sql = calls.map((call) => call.sql);
  assert.equal(sql[0], "BEGIN");
  assert.ok(sql.some((query) => query.includes("INSERT INTO eper_campaign_schedules")));
  assert.ok(sql.some((query) => query.includes("INSERT INTO eper_audit_events")));
  assert.ok(sql.some((query) => query.includes("UPDATE eper_audit_chain_head")));
  assert.equal(sql.at(-1), "COMMIT");
});

test("schedule creation rolls back when durable audit insertion fails", async () => {
  const { pool, calls } = fakePool(async (sql) => {
    if (sql.includes("INSERT INTO eper_audit_events")) throw new Error("audit storage unavailable");
    return { rows: sql.includes("INSERT INTO eper_campaign_schedules") ? [scheduleRow()] : [], rowCount: 1 };
  });
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(() => store.createSchedule({
    tenantId: "tenant-a", applicationId: "app-a", campaignId: "campaign-a",
    triggerType: "once", timezone: "Asia/Kolkata",
    scheduleDefinition: { at: "2030-01-01T10:00:00+05:30" }, createdBy: "actor-a",
  }), /CAMPAIGN_AUDIT_PERSISTENCE_FAILED/);
  const sql = calls.map((call) => call.sql);
  assert.ok(sql.includes("ROLLBACK"));
  assert.ok(!sql.includes("COMMIT"));
});


test("cancellation invalidates queued, retrying, and running executions in the same transaction", async () => {
  const { pool, calls } = fakePool(async (sql) => ({
    rows: sql.includes("UPDATE eper_campaign_schedules") ? [scheduleRow({ status: "cancelled" })] : [],
    rowCount: 1,
  }));
  const store = new PostgresCampaignSchedulerStore(pool);
  await store.pauseOrCancel({
    tenantId: "tenant-a", applicationId: "app-a",
    scheduleId: "c7d2a1a8-6a54-4ec4-a1cb-1a31e8b43c31",
    actorId: "actor-a", action: "cancel",
  });
  const cancellation = calls.find((call) => call.sql.includes("UPDATE eper_campaign_executions SET status='cancelled'"));
  assert.ok(cancellation);
  assert.match(cancellation.sql, /'queued','retry_wait','running'/);
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.equal(calls.at(-1).sql, "COMMIT");
});


test("dispatch-start fence locks live schedule and execution before marking dispatch started", async () => {
  const { pool, calls } = fakePool(async (sql) => {
    if (sql.includes("SELECT s.id") && sql.includes("FOR UPDATE OF s, e")) return { rows: [{ id: "schedule-1" }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  const store = new PostgresCampaignSchedulerStore(pool);
  const result = await store.beginExecutionDispatch({
    tenantId: "tenant-a", applicationId: "app-a",
    executionId: "c7d2a1a8-6a54-4ec4-a1cb-1a31e8b43c31", workerId: "worker-a",
  });
  assert.equal(result, true);
  const lockIndex = calls.findIndex((call) => call.sql.includes("FOR UPDATE OF s, e"));
  const fenceIndex = calls.findIndex((call) => call.sql.includes("SET dispatch_started_at=now()"));
  assert.ok(lockIndex >= 0 && fenceIndex > lockIndex);
  assert.equal(calls[0].sql, "BEGIN");
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO eper_audit_events")),
    "dispatch fence acquisition must be audited before provider dispatch");
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("dispatch-start fence is single-use and rejects a second acquisition", async () => {
  let alreadyStarted = false;
  const { pool, calls } = fakePool(async (sql) => {
    if (sql.includes("SELECT s.id") && sql.includes("FOR UPDATE OF s, e")) {
      if (alreadyStarted || !sql.includes("e.dispatch_started_at IS NULL")) return { rows: [], rowCount: 0 };
      return { rows: [{ id: "schedule-1" }], rowCount: 1 };
    }
    if (sql.includes("SET dispatch_started_at=now()")) {
      alreadyStarted = true;
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  const store = new PostgresCampaignSchedulerStore(pool);
  const input = {
    tenantId: "tenant-a", applicationId: "app-a",
    executionId: "c7d2a1a8-6a54-4ec4-a1cb-1a31e8b43c31", workerId: "worker-a",
  };
  assert.equal(await store.beginExecutionDispatch(input), true);
  assert.equal(await store.beginExecutionDispatch(input), false);
  assert.match(calls.find((call) => call.sql.includes("SELECT s.id")).sql, /e\.dispatch_started_at IS NULL/);
  assert.ok(calls.some((call) => call.sql.includes("SET dispatch_started_at=now()") && call.sql.includes("dispatch_started_at IS NULL")));
});

test("dispatch-start fence denies jobs whose live schedule is cancelled", async () => {
  const { pool, calls } = fakePool(async (sql) => {
    if (sql.includes("SELECT s.id") && sql.includes("FOR UPDATE OF s, e")) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  });
  const store = new PostgresCampaignSchedulerStore(pool);
  const result = await store.beginExecutionDispatch({
    tenantId: "tenant-a", applicationId: "app-a",
    executionId: "c7d2a1a8-6a54-4ec4-a1cb-1a31e8b43c31", workerId: "worker-a",
  });
  assert.equal(result, false);
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
  assert.ok(!calls.some((call) => call.sql.includes("SET dispatch_started_at=COALESCE")));
});



for (const [label, row, expected] of [
  ["cancelled", { schedule_status: "cancelled", execution_status: "cancelled", approval_status: "approved", locked_by: "worker-a", dispatch_started_at: null }, "cancelled"],
  ["paused", { schedule_status: "paused", execution_status: "running", approval_status: "approved", locked_by: "worker-a", dispatch_started_at: null }, "paused"],
  ["approval revoked", { schedule_status: "scheduled", execution_status: "running", approval_status: "rejected", locked_by: "worker-a", dispatch_started_at: null }, "denied"],
  ["lease lost", { schedule_status: "scheduled", execution_status: "running", approval_status: "approved", locked_by: "worker-b", dispatch_started_at: null }, "denied"],
]) {
  test(`dispatch-fence denial classifier returns ${expected} when ${label}`, async () => {
    const { pool, calls } = fakePool(async (sql) => sql.includes("SELECT s.status AS schedule_status")
      ? { rows: [row], rowCount: 1 }
      : { rows: [], rowCount: 0 });
    const store = new PostgresCampaignSchedulerStore(pool);
    const reason = await store.getDispatchFenceDenialReason({
      tenantId: "tenant-a", applicationId: "app-a",
      executionId: "c7d2a1a8-6a54-4ec4-a1cb-1a31e8b43c31", workerId: "worker-a",
    });
    assert.equal(reason, expected);
    const query = calls.find((call) => call.sql.includes("SELECT s.status AS schedule_status"));
    assert.ok(query);
    assert.match(query.sql, /e\.tenant_id=\$1 AND e\.application_id=\$2 AND e\.id=\$3/);
    assert.deepEqual(query.values, ["tenant-a", "app-a", "c7d2a1a8-6a54-4ec4-a1cb-1a31e8b43c31"]);
  });
}

test("cancellation rolls back when a running execution has crossed the dispatch fence", async () => {
  const { pool, calls } = fakePool(async (sql) => {
    if (sql.includes("UPDATE eper_campaign_schedules")) return { rows: [scheduleRow({ status: "cancelled" })], rowCount: 1 };
    if (sql.includes("SELECT id FROM eper_campaign_executions") && sql.includes("dispatch_started_at IS NOT NULL")) {
      return { rows: [{ id: "execution-1" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(
    store.pauseOrCancel({
      tenantId: "tenant-a", applicationId: "app-a",
      scheduleId: "c7d2a1a8-6a54-4ec4-a1cb-1a31e8b43c31",
      actorId: "actor-a", action: "cancel",
    }),
    /CAMPAIGN_DISPATCH_ALREADY_STARTED/,
  );
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
  assert.ok(!calls.some((call) => call.sql === "COMMIT"));
  assert.ok(!calls.some((call) => call.sql.includes("UPDATE eper_campaign_executions SET status='cancelled'")));
});


test("execution with dispatch started is dead-lettered rather than automatically replayed after failure", async () => {
  const { pool, calls } = fakePool(async (sql) => ({ rows: sql.includes("UPDATE eper_campaign_executions") ? [{
    status: "dead_letter", last_error_code: "DISPATCH_OUTCOME_UNKNOWN",
    last_error_detail_code: "PROVIDER_TIMEOUT", attempt_count: 2,
  }] : [], rowCount: 1 }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const outcome = await store.failExecution({
    tenantId: "tenant-a", applicationId: "app-a", executionId: "c7d2a1a8-6a54-4ec4-a1cb-1a31e8b43c31",
    workerId: "worker-a", errorCode: "provider_timeout",
  });
  assert.equal(outcome, "dead_letter");
  const failureUpdate = calls.find((call) => call.sql.includes("UPDATE eper_campaign_executions"));
  assert.match(failureUpdate.sql, /dispatch_started_at IS NOT NULL OR attempt_count >= \$5/);
  assert.match(failureUpdate.sql, /'DISPATCH_OUTCOME_UNKNOWN'/);
  assert.match(failureUpdate.sql, /last_error_detail_code=CASE WHEN dispatch_started_at IS NOT NULL THEN \$8 ELSE NULL END/);
  assert.equal(failureUpdate.values[7], "PROVIDER_TIMEOUT");
  assert.match(failureUpdate.sql, /completed_at=CASE WHEN dispatch_started_at IS NOT NULL OR attempt_count >= [$]5 THEN now\(\) ELSE NULL END/);
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("stale recovery does not automatically retry an execution whose dispatch may have reached provider", async () => {
  const { pool, calls } = fakePool(async () => ({ rows: [], rowCount: 1 }));
  const store = new PostgresCampaignSchedulerStore(pool);
  await store.recoverStaleExecutions(300, 5);
  const recovery = calls.find((call) => call.sql.includes("UPDATE eper_campaign_executions"));
  assert.ok(recovery);
  assert.match(recovery.sql, /dispatch_started_at IS NOT NULL OR attempt_count >= \$2/);
  assert.match(recovery.sql, /'DISPATCH_OUTCOME_UNKNOWN'/);
  assert.match(recovery.sql, /last_error_detail_code=CASE WHEN dispatch_started_at IS NOT NULL THEN 'WORKER_LEASE_EXPIRED' ELSE NULL END/);
  assert.match(recovery.sql, /completed_at=CASE WHEN dispatch_started_at IS NOT NULL OR attempt_count >= [$]2 THEN now\(\) ELSE NULL END/);
});

test("claim query excludes executions that crossed the dispatch fence and audits each claim", async () => {
  const { pool, calls } = fakePool(async (sql) => ({
    rows: sql.includes("WITH due AS") ? [{
      id: "job-1", schedule_id: "schedule-1", tenant_id: "tenant-a", application_id: "app-a",
      scheduled_for: "2030-01-01T00:00:00.000Z", status: "running", attempt_count: 1,
      idempotency_key: "idem-1", payload: {}, available_at: "2030-01-01T00:00:00.000Z",
    }] : [],
    rowCount: sql.includes("WITH due AS") ? 1 : 0,
  }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const claimed = await store.claimExecutions("worker-a", 10);
  assert.equal(claimed.length, 1);
  const claimQuery = calls.find((call) => call.sql.includes("WITH due AS"));
  assert.match(claimQuery.sql, /e\.dispatch_started_at IS NULL/);
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.equal(calls[0].sql, "BEGIN");
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("claim rolls back when a worker-lease audit event cannot be persisted", async () => {
  const { pool, calls } = fakePool(async (sql) => {
    if (sql.includes("INSERT INTO eper_audit_events")) throw new Error("audit storage unavailable");
    return {
      rows: sql.includes("WITH due AS") ? [{
        id: "job-1", schedule_id: "schedule-1", tenant_id: "tenant-a", application_id: "app-a",
        scheduled_for: "2030-01-01T00:00:00.000Z", status: "running", attempt_count: 1,
        idempotency_key: "idem-1", payload: {}, available_at: "2030-01-01T00:00:00.000Z",
      }] : [],
      rowCount: 1,
    };
  });
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(store.claimExecutions("worker-a", 10), /CAMPAIGN_AUDIT_PERSISTENCE_FAILED/);
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(calls.some((call) => call.sql === "COMMIT"), false);
});


test("scheduler readiness rejects a database missing the dispatch-fence migration", async () => {
  const { pool, calls } = fakePool(async () => ({
    rows: [{ schedules_table: "eper_campaign_schedules", executions_table: "eper_campaign_executions", dispatch_started_column: null, error_detail_column: null }],
    rowCount: 1,
  }));
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(store.assertReady(), /EPER_CAMPAIGN_DISPATCH_FENCE_MIGRATION_NOT_APPLIED/);
  assert.match(calls[0].sql, /information_schema\.columns/);
  assert.match(calls[0].sql, /dispatch_started_at/);
});

test("scheduler readiness rejects a database missing the durable error-detail migration", async () => {
  const { pool, calls } = fakePool(async () => ({
    rows: [{
      schedules_table: "eper_campaign_schedules",
      executions_table: "eper_campaign_executions",
      dispatch_started_column: "dispatch_started_at",
      error_detail_column: null,
    }],
    rowCount: 1,
  }));
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(store.assertReady(), /EPER_CAMPAIGN_ERROR_DETAIL_MIGRATION_NOT_APPLIED/);
  assert.match(calls[0].sql, /last_error_detail_code/);
});

test("scheduler readiness accepts schema with dispatch-fence migration applied", async () => {
  const { pool } = fakePool(async () => ({
    rows: [{ schedules_table: "eper_campaign_schedules", executions_table: "eper_campaign_executions", dispatch_started_column: "dispatch_started_at", error_detail_column: "last_error_detail_code" }],
    rowCount: 1,
  }));
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.doesNotReject(store.assertReady());
});


test("cancelling a claimed execution before the dispatch fence prevents fence acquisition", async () => {
  let scheduleStatus = "scheduled";
  let executionStatus = "running";
  let dispatchStarted = false;
  const { pool, calls } = fakePool(async (sql, values) => {
    if (sql.includes("UPDATE eper_campaign_schedules SET status=")) {
      if (!["draft", "scheduled", "paused"].includes(scheduleStatus)) return { rows: [], rowCount: 0 };
      scheduleStatus = String(values[3]);
      return { rows: [scheduleRow({ status: scheduleStatus, approval_status: "approved" })], rowCount: 1 };
    }
    if (sql.includes("SELECT id FROM eper_campaign_executions") && sql.includes("dispatch_started_at IS NOT NULL")) {
      return { rows: dispatchStarted ? [{ id: "execution-1" }] : [], rowCount: dispatchStarted ? 1 : 0 };
    }
    if (sql.includes("UPDATE eper_campaign_executions SET status='cancelled'")) {
      if (["queued", "retry_wait", "running"].includes(executionStatus) && !dispatchStarted) executionStatus = "cancelled";
      return { rows: [{ id: "execution-1" }], rowCount: 1 };
    }
    if (sql.includes("SELECT s.id") && sql.includes("FOR UPDATE OF s, e")) {
      const allowed = scheduleStatus === "scheduled" && executionStatus === "running" && !dispatchStarted;
      return { rows: allowed ? [{ id: "schedule-1" }] : [], rowCount: allowed ? 1 : 0 };
    }
    if (sql.includes("SET dispatch_started_at=now()")) {
      dispatchStarted = true;
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });

  const store = new PostgresCampaignSchedulerStore(pool);
  await store.pauseOrCancel({
    tenantId: "tenant-a", applicationId: "app-a",
    scheduleId: "c7d2a1a8-6a54-4ec4-a1cb-1a31e8b43c31",
    actorId: "actor-a", action: "cancel",
  });

  assert.equal(scheduleStatus, "cancelled");
  assert.equal(executionStatus, "cancelled");
  const fenceResult = await store.beginExecutionDispatch({
    tenantId: "tenant-a", applicationId: "app-a",
    executionId: "c7d2a1a8-6a54-4ec4-a1cb-1a31e8b43c31", workerId: "worker-a",
  });
  assert.equal(fenceResult, false);
  assert.equal(dispatchStarted, false);
  assert.ok(calls.some((call) => call.sql.includes("UPDATE eper_campaign_executions SET status='cancelled'")));
  assert.equal(calls.filter((call) => call.sql.includes("INSERT INTO eper_audit_events")).length, 2,
    "schedule cancellation and its execution cancellation must both be audited");
  assert.ok(calls.some((call) => call.sql === "COMMIT"), "cancellation must commit before the denied fence transaction");
  assert.equal(calls.at(-1).sql, "ROLLBACK", "the later denied dispatch-fence transaction must roll back");
});


test("pausing a schedule after execution claim prevents dispatch-fence acquisition", async () => {
  let scheduleStatus = "scheduled";
  let dispatchStarted = false;
  const { pool, calls } = fakePool(async (sql, values) => {
    if (sql.includes("UPDATE eper_campaign_schedules SET status=")) {
      scheduleStatus = String(values[3]);
      return { rows: [scheduleRow({ status: scheduleStatus, approval_status: "approved" })], rowCount: 1 };
    }
    if (sql.includes("SELECT s.id") && sql.includes("FOR UPDATE OF s, e")) {
      const allowed = scheduleStatus === "scheduled" && !dispatchStarted;
      return { rows: allowed ? [{ id: "schedule-1" }] : [], rowCount: allowed ? 1 : 0 };
    }
    if (sql.includes("SET dispatch_started_at=now()")) {
      dispatchStarted = true;
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  const store = new PostgresCampaignSchedulerStore(pool);
  await store.pauseOrCancel({
    tenantId: "tenant-a", applicationId: "app-a",
    scheduleId: "c7d2a1a8-6a54-4ec4-a1cb-1a31e8b43c31",
    actorId: "actor-a", action: "pause",
  });
  assert.equal(scheduleStatus, "paused");
  const result = await store.beginExecutionDispatch({
    tenantId: "tenant-a", applicationId: "app-a",
    executionId: "c7d2a1a8-6a54-4ec4-a1cb-1a31e8b43c31", workerId: "worker-a",
  });
  assert.equal(result, false);
  assert.equal(dispatchStarted, false);
  assert.ok(calls.some((call) => call.sql.includes("FOR UPDATE OF s, e")));
});

// Restored regression coverage retained from the scheduler foundation.

test("pausing before dispatch releases the claim without consuming retry budget", async () => {
  const { pool, calls } = fakePool(async (sql) => ({
    rows: sql.includes("UPDATE eper_campaign_executions") ? [{ id: "job-1" }] : [],
    rowCount: sql.includes("UPDATE eper_campaign_executions") ? 1 : 0,
  }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const released = await store.deferExecutionForSchedulePause({
    tenantId: "tenant-a", applicationId: "app-a", executionId: "job-1", workerId: "worker-a",
  });
  assert.equal(released, true);
  const update = calls.find((call) => call.sql.includes("UPDATE eper_campaign_executions"));
  assert.ok(update, "must update the claimed execution");
  assert.match(update.sql, /status='retry_wait'/);
  assert.match(update.sql, /last_error_code=NULL, last_error_detail_code=NULL/);
  assert.match(update.sql, /attempt_count=GREATEST\(attempt_count - 1, 0\)/);
  assert.match(update.sql, /dispatch_started_at IS NULL/);
  assert.match(update.sql, /locked_by=\$4/);
  assert.deepEqual(update.values, ["tenant-a", "app-a", "job-1", "worker-a"]);
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO eper_audit_events")), "pause deferral must be audited");
  assert.ok(calls.some((call) => call.sql === "COMMIT"), "execution update and audit must commit together");
});

test("pause deferral rolls back when durable audit append fails", async () => {
  const { pool, calls } = fakePool(async (sql) => {
    if (sql.includes("INSERT INTO eper_audit_events")) throw new Error("audit storage unavailable");
    return {
      rows: sql.includes("UPDATE eper_campaign_executions") ? [{ id: "job-1" }] : [],
      rowCount: sql.includes("UPDATE eper_campaign_executions") ? 1 : 0,
    };
  });
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(store.deferExecutionForSchedulePause({
    tenantId: "tenant-a", applicationId: "app-a", executionId: "job-1", workerId: "worker-a",
  }), /CAMPAIGN_AUDIT_PERSISTENCE_FAILED/);
  assert.ok(calls.some((call) => call.sql === "BEGIN"));
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(calls.some((call) => call.sql === "COMMIT"), false);
});

test("completed one-time schedule cannot be cancelled when no pending execution remains", async () => {
  const { pool, calls } = fakePool(async (sql) => ({
    rows: [],
    rowCount: 0,
  }));
  const store = new PostgresCampaignSchedulerStore(pool);
  await assert.rejects(store.pauseOrCancel({
    tenantId: "tenant-a", applicationId: "app-a",
    scheduleId: "c7d2a1a8-6a54-4ec4-a1cb-1a31e8b43c31",
    actorId: "actor-a", action: "cancel",
  }), /CAMPAIGN_SCHEDULE_NOT_FOUND_OR_NOT_MUTABLE/);
  const update = calls.find((call) => call.sql.includes("UPDATE eper_campaign_schedules"));
  assert.ok(update);
  assert.match(update.sql, /status='completed' AND trigger_type='once' AND EXISTS/);
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(calls.some((call) => call.sql === "COMMIT"), false);
});

test("pause cannot mutate a completed one-time schedule", async () => {
  const { pool, calls } = fakePool(async (sql) => ({
    rows: sql.includes("UPDATE eper_campaign_schedules") ? [scheduleRow({ status: "paused" })] : [],
    rowCount: 1,
  }));
  const store = new PostgresCampaignSchedulerStore(pool);
  await store.pauseOrCancel({
    tenantId: "tenant-a", applicationId: "app-a",
    scheduleId: "c7d2a1a8-6a54-4ec4-a1cb-1a31e8b43c31",
    actorId: "actor-a", action: "pause",
  });
  const scheduleUpdate = calls.find((call) => call.sql.includes("UPDATE eper_campaign_schedules"));
  assert.ok(scheduleUpdate);
  assert.match(scheduleUpdate.sql, /status IN \('draft','scheduled','paused'\)/);
  assert.doesNotMatch(scheduleUpdate.sql, /status IN \('draft','scheduled','paused','completed'\)/);
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.equal(calls.at(-1).sql, "COMMIT");
});


test("event execution idempotency key stays within the database limit for maximum-length event identities", async () => {
  const { pool, calls } = fakePool(async () => ({ rows: [], rowCount: 0 }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const input = {
    tenantId: "tenant-a",
    applicationId: "app-a",
    eventType: "e".repeat(128),
    eventId: "i".repeat(256),
    occurredAt: "2030-01-01T00:00:00.000Z",
    payload: {},
  };
  await store.enqueueEventExecutions(input);
  const insert = calls.find((call) => call.sql.includes("INSERT INTO eper_campaign_executions"));
  assert.ok(insert);
  assert.match(insert.sql, /'event:' \|\| \$7 \|\| ':' \|\| s\.id::text/);
  assert.equal(insert.values[6].length, 64, "SHA-256 identity digest must be bounded");
  assert.match(insert.values[6], /^[a-f0-9]{64}$/);
  assert.equal(insert.values[3], input.eventId);
  assert.equal(insert.values[4], input.eventType);
});

test("execution diagnostics expose durable error classifications within tenant and application scope", async () => {
  const { pool, calls } = fakePool(async (sql) => ({
    rows: sql.includes("SELECT id, schedule_id, status, attempt_count")
      ? [{
          id: "execution-a", schedule_id: "schedule-a", status: "dead_letter", attempt_count: 2,
          last_error_code: "DISPATCH_OUTCOME_UNKNOWN",
          last_error_detail_code: "CAMPAIGN_EXECUTION_COMPLETION_LEASE_LOST",
          dispatch_started_at: "2030-01-01T10:00:00.000Z",
          completed_at: "2030-01-01T10:00:05.000Z",
          updated_at: "2030-01-01T10:00:05.000Z",
        }]
      : [],
    rowCount: 1,
  }));
  const store = new PostgresCampaignSchedulerStore(pool);
  const result = await store.getExecutionDiagnostics({
    tenantId: "tenant-a", applicationId: "app-a", executionId: "execution-a",
  });
  assert.equal(result.status, "dead_letter");
  assert.equal(result.lastErrorCode, "DISPATCH_OUTCOME_UNKNOWN");
  assert.equal(result.lastErrorDetailCode, "CAMPAIGN_EXECUTION_COMPLETION_LEASE_LOST");
  const query = calls[0];
  assert.match(query.sql, /WHERE tenant_id=\$1 AND application_id=\$2 AND id=\$3/);
  assert.deepEqual(query.values, ["tenant-a", "app-a", "execution-a"]);
  assert.doesNotMatch(query.sql, /payload|idempotency_key/);
});

test("completion lease loss is durably dead-lettered after the worker no longer owns the lease", async () => {
  const { pool, calls } = fakePool(async (sql) => {
    if (sql.includes("UPDATE eper_campaign_executions") && sql.includes("locked_by=$4")) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes("UPDATE eper_campaign_executions") && sql.includes("dispatch_started_at IS NOT NULL")) {
      return {
        rows: [{
          status: "dead_letter",
          last_error_code: "DISPATCH_OUTCOME_UNKNOWN",
          last_error_detail_code: "CAMPAIGN_EXECUTION_COMPLETION_LEASE_LOST",
          attempt_count: 2,
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 1 };
  });
  const store = new PostgresCampaignSchedulerStore(pool);
  const outcome = await store.failExecution({
    tenantId: "tenant-a",
    applicationId: "app-a",
    executionId: "c7d2a1a8-6a54-4ec4-a1cb-1a31e8b43c31",
    workerId: "worker-a",
    errorCode: "CAMPAIGN_EXECUTION_COMPLETION_LEASE_LOST",
  });
  assert.equal(outcome, "dead_letter");
  const leaseOwnedUpdate = calls.find((call) => call.sql.includes("UPDATE eper_campaign_executions") && call.sql.includes("locked_by=$4"));
  assert.ok(leaseOwnedUpdate, "the normal lease-owned failure update is attempted first");
  const diagnosticUpdate = calls.find((call) => call.sql.includes("UPDATE eper_campaign_executions") && call.sql.includes("SET status='dead_letter'"));
  assert.ok(diagnosticUpdate, "the dispatch-fenced row receives a diagnostic-only safety update after lease loss");
  assert.match(diagnosticUpdate.sql, /status='dead_letter'/);
  assert.match(diagnosticUpdate.sql, /last_error_code='DISPATCH_OUTCOME_UNKNOWN'/);
  assert.equal(diagnosticUpdate.values[3], "CAMPAIGN_EXECUTION_COMPLETION_LEASE_LOST");
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.equal(calls.at(-1).sql, "COMMIT");
});


test("event fan-out accepts event IDs through 256 characters and rejects longer IDs before database access", async () => {
  const { pool, calls } = fakePool();
  const store = new PostgresCampaignSchedulerStore(pool);
  await store.enqueueEventExecutions({
    tenantId: "tenant-a", applicationId: "app-a", eventType: "lead.created",
    eventId: "e".repeat(256), occurredAt: "2030-01-01T00:00:00.000Z",
  });
  assert.equal(calls.length, 1, "256-character event ID must reach the idempotent insert");
  assert.equal(calls[0].values[6].length, 64, "event idempotency identity must fit the bounded database key");
  assert.match(calls[0].values[6], /^[a-f0-9]{64}$/);
  assert.equal(calls[0].values[6], createHash("sha256").update("lead.created").update("\0").update("e".repeat(256)).digest("hex"));
  await assert.rejects(store.enqueueEventExecutions({
    tenantId: "tenant-a", applicationId: "app-a", eventType: "lead.created",
    eventId: "e".repeat(257), occurredAt: "2030-01-01T00:00:00.000Z",
  }), /CAMPAIGN_EVENT_IDENTITY_INVALID/);
  assert.equal(calls.length, 1, "257-character event ID must be rejected before database access");
});
