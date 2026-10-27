import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { PostgresCampaignSchedulerStore } from "../dist/packages/campaign-scheduler/postgres-campaign-scheduler-store.js";

const databaseUrl = process.env.EPER_CAMPAIGN_SCHEDULER_TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);

test("PostgreSQL serializes pause against dispatch fence and prevents dispatch after pause", {
  skip: !enabled ? "Set EPER_CAMPAIGN_SCHEDULER_TEST_DATABASE_URL to an isolated, migrated test database" : false,
}, async () => {
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  assert.match(databaseName, /(test|ci|sandbox)/i,
    "Refusing to run against a database whose name does not clearly identify it as test/CI/sandbox");

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
  const tenantId = "scheduler-race-test-" + randomUUID();
  const applicationId = "app-race-" + randomUUID();
  const actorId = "integration-test";
  const store = new PostgresCampaignSchedulerStore(pool, "sandbox", "postgres-race-test");
  let scheduleId;
  let executionId;
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

    const schedule = await store.createSchedule({
      tenantId, applicationId, campaignId: "campaign-race",
      triggerType: "once", timezone: "UTC",
      scheduleDefinition: { at: "2035-01-01T00:00:00Z" }, createdBy: actorId,
    });
    scheduleId = schedule.id;
    await store.approveAndSchedule({
      tenantId, applicationId, scheduleId, actorId,
      nextRunAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const execution = await store.enqueueExecution({
      tenantId, applicationId, scheduleId,
      scheduledFor: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: "race:" + randomUUID(), payload: { integrationTest: true },
    });
    assert.ok(execution, "Expected a durable execution for the approved schedule");
    executionId = execution.id;

    const claimed = await store.claimExecutions("race-worker", 1);
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].id, executionId);

    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        "SELECT id FROM eper_campaign_schedules WHERE tenant_id=$1 AND application_id=$2 AND id=$3 FOR UPDATE",
        [tenantId, applicationId, scheduleId],
      );
      const dispatchPromise = store.beginExecutionDispatch({
        tenantId, applicationId, executionId, workerId: "race-worker",
      });
      // Give the dispatch transaction time to reach its SELECT ... FOR UPDATE while this
      // transaction owns the schedule row lock. No production database is used here.
      await delay(75);
      await blocker.query(
        "UPDATE eper_campaign_schedules SET status='paused', updated_at=now() WHERE tenant_id=$1 AND application_id=$2 AND id=$3",
        [tenantId, applicationId, scheduleId],
      );
      await blocker.query("COMMIT");
      assert.equal(await dispatchPromise, false,
        "Dispatch fence must reject after the pause transaction commits");
    } catch (error) {
      try { await blocker.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      blocker.release();
    }

    const persisted = await pool.query(
      "SELECT s.status, e.dispatch_started_at FROM eper_campaign_schedules s JOIN eper_campaign_executions e ON e.schedule_id=s.id WHERE s.tenant_id=$1 AND s.application_id=$2 AND s.id=$3 AND e.id=$4",
      [tenantId, applicationId, scheduleId, executionId],
    );
    assert.equal(persisted.rows[0]?.status, "paused");
    assert.equal(persisted.rows[0]?.dispatch_started_at, null);
  } finally {
    if (scheduleId) {
      await pool.query("DELETE FROM eper_campaign_executions WHERE tenant_id=$1 AND application_id=$2 AND schedule_id=$3", [tenantId, applicationId, scheduleId]);
      await pool.query("DELETE FROM eper_campaign_schedules WHERE tenant_id=$1 AND application_id=$2 AND id=$3", [tenantId, applicationId, scheduleId]);
    }
    await pool.end();
  }
});
