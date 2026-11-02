import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresCampaignSchedulerStore } from "../dist/packages/campaign-scheduler/postgres-campaign-scheduler-store.js";

const databaseUrl = process.env.EPER_CAMPAIGN_SCHEDULER_TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);

test("PostgreSQL worker restart recovers an unfenced lease and never replays a fenced execution", {
  skip: !enabled ? "Set EPER_CAMPAIGN_SCHEDULER_TEST_DATABASE_URL to an isolated, migrated test database" : false,
}, async () => {
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  assert.match(databaseName, /(^|[_-])(test|ci|sandbox)([_-]|$)/i,
    "Refusing to run against a database whose name does not clearly identify it as test/CI/sandbox");

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 3000 });
  const tenantId = "scheduler-restart-test-" + randomUUID();
  const applicationId = "app-restart-" + randomUUID();
  const actorId = "integration-test";
  const store = new PostgresCampaignSchedulerStore(pool, "sandbox", "postgres-worker-restart-test");
  const schedules = [];
  try {
    const schema = await pool.query(`
      SELECT to_regclass('public.eper_campaign_schedules') AS schedules,
             to_regclass('public.eper_campaign_executions') AS executions,
             to_regclass('public.eper_audit_events') AS audit_events,
             (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='eper_campaign_executions'
                AND column_name='dispatch_started_at') AS dispatch_fence
    `);
    assert.ok(schema.rows[0]?.schedules && schema.rows[0]?.executions && schema.rows[0]?.audit_events,
      "Apply the campaign scheduler and audit migrations to this disposable test database first");
    assert.equal(schema.rows[0]?.dispatch_fence, 1,
      "Apply migration 002_campaign_dispatch_fence.sql before running this integration test");

    async function createDueExecution(label) {
      const schedule = await store.createSchedule({
        tenantId, applicationId, campaignId: "campaign-" + label,
        triggerType: "once", timezone: "UTC",
        scheduleDefinition: { at: "2035-01-01T00:00:00Z" }, createdBy: actorId,
      });
      schedules.push(schedule.id);
      await store.approveAndSchedule({
        tenantId, applicationId, scheduleId: schedule.id, actorId,
        nextRunAt: new Date(Date.now() + 60_000).toISOString(),
      });
      const idempotencyKey = "restart:" + label + ":" + randomUUID();
      const execution = await store.enqueueExecution({
        tenantId, applicationId, scheduleId: schedule.id,
        scheduledFor: new Date(Date.now() - 1000).toISOString(),
        idempotencyKey, payload: { integrationTest: true, label },
      });
      assert.ok(execution);
      return { execution, idempotencyKey };
    }

    // Simulate process death after claiming work but before the irreversible dispatch fence.
    const safe = await createDueExecution("safe-retry");
    const firstClaim = await store.claimExecutions("worker-before-restart", 1);
    assert.equal(firstClaim.length, 1);
    assert.equal(firstClaim[0].id, safe.execution.id);
    await pool.query(
      "UPDATE eper_campaign_executions SET locked_at=now()-interval '10 minutes' WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND locked_by=$4",
      [tenantId, applicationId, safe.execution.id, "worker-before-restart"],
    );

    assert.equal(await store.recoverStaleExecutions(30, 5), 1);
    const recovered = await pool.query(
      "SELECT status, attempt_count, last_error_code, dispatch_started_at, locked_by FROM eper_campaign_executions WHERE tenant_id=$1 AND application_id=$2 AND id=$3",
      [tenantId, applicationId, safe.execution.id],
    );
    assert.equal(recovered.rows[0]?.status, "retry_wait");
    assert.equal(Number(recovered.rows[0]?.attempt_count), 1);
    assert.equal(recovered.rows[0]?.last_error_code, "WORKER_LEASE_EXPIRED");
    assert.equal(recovered.rows[0]?.dispatch_started_at, null);
    assert.equal(recovered.rows[0]?.locked_by, null);

    // Make the retry immediately eligible within this isolated test; preserve the same key.
    await pool.query(
      "UPDATE eper_campaign_executions SET available_at=now() WHERE tenant_id=$1 AND application_id=$2 AND id=$3",
      [tenantId, applicationId, safe.execution.id],
    );
    const replacementClaim = await store.claimExecutions("worker-after-restart", 1);
    assert.equal(replacementClaim.length, 1);
    assert.equal(replacementClaim[0].id, safe.execution.id);
    assert.equal(replacementClaim[0].attemptCount, 2);
    assert.equal(replacementClaim[0].idempotencyKey, safe.idempotencyKey);

    // Simulate process death after the dispatch fence: outcome is ambiguous and must not replay.
    const fenced = await createDueExecution("fenced-no-replay");
    const fencedClaim = await store.claimExecutions("worker-before-fenced-restart", 1);
    assert.equal(fencedClaim.length, 1);
    assert.equal(fencedClaim[0].id, fenced.execution.id);
    await pool.query(
      "UPDATE eper_campaign_executions SET dispatch_started_at=now(), locked_at=now()-interval '10 minutes' WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND locked_by=$4",
      [tenantId, applicationId, fenced.execution.id, "worker-before-fenced-restart"],
    );

    assert.equal(await store.recoverStaleExecutions(30, 5), 1);
    const deadLetter = await pool.query(
      "SELECT status, attempt_count, last_error_code, last_error_detail_code, dispatch_started_at, locked_by FROM eper_campaign_executions WHERE tenant_id=$1 AND application_id=$2 AND id=$3",
      [tenantId, applicationId, fenced.execution.id],
    );
    assert.equal(deadLetter.rows[0]?.status, "dead_letter");
    assert.equal(Number(deadLetter.rows[0]?.attempt_count), 1);
    assert.equal(deadLetter.rows[0]?.last_error_code, "DISPATCH_OUTCOME_UNKNOWN");
    assert.equal(deadLetter.rows[0]?.last_error_detail_code, "WORKER_LEASE_EXPIRED");
    assert.ok(deadLetter.rows[0]?.dispatch_started_at);
    assert.equal(deadLetter.rows[0]?.locked_by, null);
    assert.deepEqual(await store.claimExecutions("worker-after-fenced-restart", 10), [],
      "A fenced execution with ambiguous provider outcome must never be automatically replayed");
  } finally {
    if (schedules.length) {
      await pool.query(
        "DELETE FROM eper_campaign_executions WHERE tenant_id=$1 AND application_id=$2 AND schedule_id=ANY($3::uuid[])",
        [tenantId, applicationId, schedules],
      );
      await pool.query(
        "DELETE FROM eper_campaign_schedules WHERE tenant_id=$1 AND application_id=$2 AND id=ANY($3::uuid[])",
        [tenantId, applicationId, schedules],
      );
    }
    await pool.end();
  }
});
