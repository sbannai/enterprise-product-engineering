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
  assert.match(databaseName, /(^|[_-])(test|ci|sandbox)([_-]|$)/i,
    "Refusing to run against a database whose name does not clearly identify it as test/CI/sandbox");

  const poolEvents = [];
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 3000 });
  pool.on("connect", (client) => poolEvents.push({ event: "connect", pid: client.processID }));
  pool.on("acquire", (client) => poolEvents.push({ event: "acquire", pid: client.processID }));
  pool.on("error", (error) => poolEvents.push({ event: "pool-error", message: error.message }));
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
    const futureExecution = await store.enqueueExecution({
      tenantId, applicationId, scheduleId,
      scheduledFor: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: "race:future:" + randomUUID(), payload: { integrationTest: true },
    });
    assert.ok(futureExecution, "Expected a durable future execution");
    assert.deepEqual(await store.claimExecutions("early-worker", 1), [],
      "A worker must not claim an execution before scheduled_for");

    const execution = await store.enqueueExecution({
      tenantId, applicationId, scheduleId,
      scheduledFor: new Date(Date.now() - 1000).toISOString(),
      idempotencyKey: "race:due:" + randomUUID(), payload: { integrationTest: true },
    });
    assert.ok(execution, "Expected a durable execution for the approved schedule");
    executionId = execution.id;

    const claimed = await store.claimExecutions("race-worker", 1);
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].id, executionId);

    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      const blockerRow = await blocker.query(
        "SELECT id FROM eper_campaign_schedules WHERE tenant_id=$1 AND application_id=$2 AND id=$3 FOR UPDATE",
        [tenantId, applicationId, scheduleId],
      );
      assert.equal(blockerRow.rowCount, 1, "Expected the competing pause transaction to lock the schedule row");
      const blockerPidResult = await blocker.query("SELECT pg_backend_pid() AS pid");
      const blockerPid = Number(blockerPidResult.rows[0]?.pid);
      assert.ok(Number.isInteger(blockerPid) && blockerPid > 0, "Expected a PostgreSQL backend PID for the blocker");

      let dispatchOutcome = "pending";
      let dispatchError = null;
      const dispatchPromise = store.beginExecutionDispatch({
        tenantId, applicationId, executionId, workerId: "race-worker",
      }).then((result) => {
        dispatchOutcome = String(result);
        return result;
      }, (error) => {
        dispatchError = error instanceof Error ? error.message : String(error);
        return false;
      });

      // Do not rely on a fixed sleep or exact SQL-text formatting. Prove the
      // dispatch transaction is blocked by this transaction using PostgreSQL's
      // lock graph before committing the competing pause.
      const deadline = Date.now() + 5000;
      let dispatchIsWaiting = false;
      while (Date.now() < deadline) {
        const waiting = await blocker.query(`
          SELECT 1
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND pid <> pg_backend_pid()
            AND state = 'active'
            AND $1::integer = ANY(pg_blocking_pids(pid))
            AND query ILIKE '%eper_campaign_schedules%'
            AND query ILIKE '%eper_campaign_executions%'
          LIMIT 1
        `, [blockerPid]);
        if (waiting.rowCount > 0) {
          dispatchIsWaiting = true;
          break;
        }
        await delay(25);
      }
      if (!dispatchIsWaiting) {
        const rowState = await blocker.query(`
          SELECT s.status AS schedule_status, s.approval_status, s.trigger_type,
                 e.status AS execution_status, e.locked_by, e.dispatch_started_at
          FROM eper_campaign_schedules s
          JOIN eper_campaign_executions e
            ON e.schedule_id=s.id AND e.tenant_id=s.tenant_id AND e.application_id=s.application_id
          WHERE s.tenant_id=$1 AND s.application_id=$2 AND s.id=$3 AND e.id=$4
        `, [tenantId, applicationId, scheduleId, executionId]);
        const activity = await blocker.query(`
          SELECT pid, datname, usename, application_name, state,
                 wait_event_type, wait_event, query, pg_blocking_pids(pid) AS blockers
          FROM pg_stat_activity
          WHERE pid <> pg_backend_pid()
          ORDER BY pid
        `);
        assert.fail("Dispatch lock wait not observed; " + JSON.stringify({
          dispatchOutcome, dispatchError, row: rowState.rows[0] ?? null, activity: activity.rows,
          pool: {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount,
            connectionTimeoutMillis: pool.options.connectionTimeoutMillis,
          },
          poolEvents,
          blockerPid,
        }));
      }

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
