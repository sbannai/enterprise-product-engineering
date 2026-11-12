import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { PostgresCampaignSchedulerStore } from "../dist/packages/campaign-scheduler/postgres-campaign-scheduler-store.js";
import { createCampaignSchedulerWakeListener } from "../dist/packages/campaign-scheduler/campaign-scheduler-postgres-wake-listener.js";

const databaseUrl = process.env.EPER_CAMPAIGN_SCHEDULER_TEST_DATABASE_URL;
const workerDatabaseUrl = process.env.EPER_CAMPAIGN_SCHEDULER_WORKER_TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);

test("PostgreSQL serializes pause against dispatch fence and prevents dispatch after pause", {
  skip: !enabled ? "Set EPER_CAMPAIGN_SCHEDULER_TEST_DATABASE_URL to an isolated, migrated test database" : false,
}, async () => {
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  assert.ok(databaseName.length > 0, "test database name must be present");
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
                AND column_name='dispatch_started_at') AS dispatch_fence,
             (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='eper_campaign_executions'
                AND column_name='claim_generation') AS claim_generation
    `);
    assert.ok(schema.rows[0]?.schedules && schema.rows[0]?.executions && schema.rows[0]?.audit_events,
      "Apply the campaign scheduler and audit migrations to this disposable test database first");
    assert.equal(schema.rows[0]?.claim_generation, 1, "Apply migration 004_campaign_claim_generation.sql before running this integration test");
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
    assert.equal(claimed[0].claimGeneration, 1, "A newly claimed execution must start at generation 1");

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
        tenantId, applicationId, executionId, workerId: "race-worker", claimGeneration: claimed[0].claimGeneration,
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
        // pg_stat_activity snapshots are cached within a transaction; clear the
        // snapshot so each poll can see the dispatch backend opened after BEGIN.
        await blocker.query("SELECT pg_stat_clear_snapshot()");
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
        await blocker.query("SELECT pg_stat_clear_snapshot()");
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


test("PostgreSQL accepts a 256-character event ID with a bounded idempotency key", {
  skip: !enabled ? "Set EPER_CAMPAIGN_SCHEDULER_TEST_DATABASE_URL to an isolated, migrated test database" : false,
}, async () => {
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  assert.match(databaseName, /(^|[_-])(test|ci|sandbox)([_-]|$)/i,
    "Refusing to run against a database whose name does not clearly identify it as test/CI/sandbox");

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 3000 });
  const tenantId = "scheduler-event-id-test-" + randomUUID();
  const applicationId = "app-event-id-" + randomUUID();
  const scheduleId = randomUUID();
  const store = new PostgresCampaignSchedulerStore(pool, "sandbox", "postgres-event-id-test");
  try {
    await pool.query(
      `INSERT INTO eper_campaign_schedules
        (id, tenant_id, application_id, campaign_id, trigger_type, timezone,
         schedule_definition, approval_status, status, next_run_at, created_by, updated_by)
       VALUES ($1,$2,$3,$4,'event','UTC',$5::jsonb,'approved','scheduled',$6,$7,$7)`,
      [scheduleId, tenantId, applicationId, "campaign-event-id", JSON.stringify({ eventType: "lead.created" }),
        new Date(Date.now() + 60_000).toISOString(), "integration-test"],
    );

    const input = {
      tenantId, applicationId, eventType: "lead.created",
      eventId: "e".repeat(256), occurredAt: new Date().toISOString(),
      payload: { integrationTest: true },
    };
    assert.equal(await store.enqueueEventExecutions(input), 1);
    const persisted = await pool.query(
      "SELECT idempotency_key FROM eper_campaign_executions WHERE tenant_id=$1 AND application_id=$2",
      [tenantId, applicationId],
    );
    assert.equal(persisted.rowCount, 1);
    assert.ok(persisted.rows[0].idempotency_key.length <= 256);
    assert.match(persisted.rows[0].idempotency_key, /^event:[a-f0-9]{64}:/);
    assert.equal(await store.enqueueEventExecutions(input), 0, "repeated event delivery must remain idempotent");
  } finally {
    await pool.query("DELETE FROM eper_campaign_executions WHERE tenant_id=$1 AND application_id=$2", [tenantId, applicationId]);
    await pool.query("DELETE FROM eper_campaign_schedules WHERE tenant_id=$1 AND application_id=$2 AND id=$3", [tenantId, applicationId, scheduleId]);
    await pool.end();
  }
});


test("PostgreSQL committed campaign execution insert wakes the dedicated LISTEN connection", {
  skip: !enabled ? "Set EPER_CAMPAIGN_SCHEDULER_TEST_DATABASE_URL to an isolated, migrated test database" : false,
}, async () => {
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  assert.match(databaseName, /(^|[_-])(test|ci|sandbox)([_-]|$)/i,
    "Refusing to run against a database whose name does not clearly identify it as test/CI/sandbox");

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 3000 });
  const listener = createCampaignSchedulerWakeListener({
    connectionString: databaseUrl,
    reconnectDelayMs: 50,
    maxReconnectDelayMs: 250,
  });
  const tenantId = "scheduler-wake-test-" + randomUUID();
  const applicationId = "app-wake-" + randomUUID();
  const actorId = "integration-test";
  const store = new PostgresCampaignSchedulerStore(pool, "sandbox", "postgres-wake-test");
  let scheduleId;
  try {
    await listener.start();
    const schedule = await store.createSchedule({
      tenantId, applicationId, campaignId: "campaign-wake",
      triggerType: "once", timezone: "UTC",
      scheduleDefinition: { at: "2035-01-01T00:00:00Z" }, createdBy: actorId,
    });
    scheduleId = schedule.id;
    await store.approveAndSchedule({
      tenantId, applicationId, scheduleId, actorId,
      nextRunAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const wakePromise = listener.waitForWake(5_000).then(() => true);
    const execution = await store.enqueueExecution({
      tenantId, applicationId, scheduleId,
      scheduledFor: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: "wake:" + randomUUID(),
      payload: { integrationTest: true },
    });
    assert.ok(execution, "Expected a durable execution row to be inserted");
    const woke = await Promise.race([
      wakePromise,
      delay(1_500).then(() => false),
    ]);
    assert.equal(woke, true, "A committed execution insert must wake the dedicated PostgreSQL listener promptly");
  } finally {
    await listener.close();
    if (scheduleId) {
      await pool.query(
        "DELETE FROM eper_campaign_executions WHERE tenant_id=$1 AND application_id=$2 AND schedule_id=$3",
        [tenantId, applicationId, scheduleId],
      );
      await pool.query(
        "DELETE FROM eper_campaign_schedules WHERE tenant_id=$1 AND application_id=$2 AND id=$3",
        [tenantId, applicationId, scheduleId],
      );
    }
    await pool.end();
  }
});

test("campaign scheduler worker database role is non-login and limited to execution and audit operations", {
  skip: !enabled ? "Set EPER_CAMPAIGN_SCHEDULER_TEST_DATABASE_URL to an isolated, migrated test database" : false,
}, async () => {
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  assert.match(databaseName, /(^|[_-])(test|ci|sandbox)([_-]|$)/i,
    "Refusing to inspect worker-role grants outside a disposable test/CI/sandbox database");
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3000 });
  try {
    const role = await pool.query(
      "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=$1",
      ["eper_campaign_scheduler_worker_access"],
    );
    assert.equal(role.rowCount, 1, "Apply migration 006_campaign_scheduler_worker_access_role.sql");
    assert.deepEqual(role.rows[0], {
      rolcanlogin: false, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false,
    });
    const grants = await pool.query(`
      SELECT
        has_table_privilege('eper_campaign_scheduler_worker_access', 'public.eper_campaign_schedules', 'SELECT') AS schedule_select,
        has_table_privilege('eper_campaign_scheduler_worker_access', 'public.eper_campaign_executions', 'SELECT') AS execution_select,
        has_table_privilege('eper_campaign_scheduler_worker_access', 'public.eper_campaign_executions', 'DELETE') AS execution_delete,
        has_table_privilege('eper_campaign_scheduler_worker_access', 'public.eper_campaign_schedules', 'DELETE') AS schedule_delete,
        has_column_privilege('eper_campaign_scheduler_worker_access', 'public.eper_campaign_schedules', 'next_run_at', 'UPDATE') AS schedule_advance,
        has_column_privilege('eper_campaign_scheduler_worker_access', 'public.eper_campaign_schedules', 'campaign_id', 'UPDATE') AS schedule_definition_update,
        has_column_privilege('eper_campaign_scheduler_worker_access', 'public.eper_campaign_executions', 'status', 'UPDATE') AS execution_status_update,
        has_column_privilege('eper_campaign_scheduler_worker_access', 'public.eper_campaign_executions', 'payload', 'UPDATE') AS execution_payload_update,
        has_table_privilege('eper_campaign_scheduler_worker_access', 'public.eper_audit_events', 'INSERT') AS audit_append,
        has_table_privilege('eper_campaign_scheduler_worker_access', 'public.eper_audit_events', 'UPDATE') AS audit_rewrite
    `);
    assert.deepEqual(grants.rows[0], {
      schedule_select: true, execution_select: true,
      execution_delete: false, schedule_delete: false,
      schedule_advance: true, schedule_definition_update: false,
      execution_status_update: true, execution_payload_update: false,
      audit_append: true, audit_rewrite: false,
    });
  } finally {
    await pool.end();
  }
});

test("PostgreSQL duplicate scheduled enqueue returns the original execution without UPDATE privilege", {
  skip: !enabled ? "Set EPER_CAMPAIGN_SCHEDULER_TEST_DATABASE_URL to an isolated, migrated test database" : false,
}, async () => {
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  assert.match(databaseName, /(^|[_-])(test|ci|sandbox)([_-]|$)/i,
    "Refusing to exercise enqueue idempotency outside a disposable test/CI/sandbox database");

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 3000 });
  const tenantId = "scheduler-enqueue-idempotency-" + randomUUID();
  const applicationId = "app-enqueue-idempotency-" + randomUUID();
  const store = new PostgresCampaignSchedulerStore(pool, "sandbox", "postgres-enqueue-idempotency-test");
  let scheduleId;
  try {
    const schedule = await store.createSchedule({
      tenantId, applicationId, campaignId: "campaign-enqueue-idempotency",
      triggerType: "once", timezone: "UTC",
      scheduleDefinition: { at: "2035-01-01T00:00:00Z" }, createdBy: "integration-test",
    });
    scheduleId = schedule.id;
    await store.approveAndSchedule({
      tenantId, applicationId, scheduleId, actorId: "integration-test",
      nextRunAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const idempotencyKey = "enqueue:duplicate:" + randomUUID();
    const input = {
      tenantId, applicationId, scheduleId,
      scheduledFor: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey,
      payload: { integrationTest: true, immutableIdentity: "original" },
    };
    const first = await store.enqueueExecution(input);
    const duplicate = await store.enqueueExecution({
      ...input,
      payload: { integrationTest: true, immutableIdentity: "must-not-replace-original" },
    });

    assert.ok(first, "Expected first enqueue to create a durable execution");
    assert.ok(duplicate, "Expected duplicate enqueue to return the existing execution");
    assert.equal(duplicate.id, first.id, "Duplicate enqueue must return the original execution ID");
    assert.equal(duplicate.idempotencyKey, idempotencyKey);
    assert.deepEqual(duplicate.payload, input.payload,
      "Duplicate enqueue must not overwrite the original execution payload");

    const persisted = await pool.query(
      `SELECT id, payload, idempotency_key
       FROM eper_campaign_executions
       WHERE tenant_id=$1 AND application_id=$2 AND idempotency_key=$3`,
      [tenantId, applicationId, idempotencyKey],
    );
    assert.equal(persisted.rowCount, 1, "Duplicate enqueue must not create a second execution");
    assert.equal(String(persisted.rows[0].id), first.id);
    assert.equal(persisted.rows[0].idempotency_key, idempotencyKey);
    assert.deepEqual(persisted.rows[0].payload, input.payload);
  } finally {
    if (scheduleId) {
      await pool.query(
        "DELETE FROM eper_campaign_executions WHERE tenant_id=$1 AND application_id=$2 AND schedule_id=$3",
        [tenantId, applicationId, scheduleId],
      );
      await pool.query(
        "DELETE FROM eper_campaign_schedules WHERE tenant_id=$1 AND application_id=$2 AND id=$3",
        [tenantId, applicationId, scheduleId],
      );
    }
    await pool.end();
  }
});


test("dedicated scheduler LOGIN role can enqueue idempotently without UPDATE privilege", {
  skip: !enabled || !workerDatabaseUrl
    ? "Set isolated admin and EPER_CAMPAIGN_SCHEDULER_WORKER_TEST_DATABASE_URL connections"
    : false,
}, async () => {
  const adminParsed = new URL(databaseUrl);
  const workerParsed = new URL(workerDatabaseUrl);
  const databaseName = decodeURIComponent(adminParsed.pathname.slice(1));
  assert.match(databaseName, /(^|[_-])(test|ci|sandbox)([_-]|$)/i,
    "Refusing to exercise the worker LOGIN role outside a disposable test/CI/sandbox database");
  assert.equal(workerParsed.pathname, adminParsed.pathname, "Admin and worker URLs must target the same disposable database");

  const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3000 });
  const workerPool = new pg.Pool({ connectionString: workerDatabaseUrl, max: 2, connectionTimeoutMillis: 3000 });
  const tenantId = "scheduler-worker-login-" + randomUUID();
  const applicationId = "app-worker-login-" + randomUUID();
  const store = new PostgresCampaignSchedulerStore(workerPool, "sandbox", "postgres-worker-login-idempotency-test");
  let scheduleId;
  try {
    const identity = await workerPool.query(`
      SELECT current_user AS role_name,
             r.rolcanlogin, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolbypassrls,
             has_column_privilege(current_user, 'public.eper_campaign_executions', 'idempotency_key', 'UPDATE') AS can_rewrite_idempotency_key,
             has_column_privilege(current_user, 'public.eper_campaign_executions', 'payload', 'UPDATE') AS can_rewrite_payload
      FROM pg_catalog.pg_roles r
      WHERE r.rolname = current_user
    `);
    assert.equal(identity.rowCount, 1);
    assert.equal(identity.rows[0].role_name, "eper_campaign_scheduler_worker_runtime");
    assert.deepEqual({
      rolcanlogin: identity.rows[0].rolcanlogin,
      rolsuper: identity.rows[0].rolsuper,
      rolcreatedb: identity.rows[0].rolcreatedb,
      rolcreaterole: identity.rows[0].rolcreaterole,
      rolbypassrls: identity.rows[0].rolbypassrls,
      can_rewrite_idempotency_key: identity.rows[0].can_rewrite_idempotency_key,
      can_rewrite_payload: identity.rows[0].can_rewrite_payload,
    }, {
      rolcanlogin: true, rolsuper: false, rolcreatedb: false, rolcreaterole: false,
      rolbypassrls: false, can_rewrite_idempotency_key: false, can_rewrite_payload: false,
    });

    const adminStore = new PostgresCampaignSchedulerStore(adminPool, "sandbox", "postgres-worker-login-test-setup");
    const schedule = await adminStore.createSchedule({
      tenantId, applicationId, campaignId: "campaign-worker-login-idempotency",
      triggerType: "once", timezone: "UTC",
      scheduleDefinition: { at: "2035-01-01T00:00:00Z" }, createdBy: "integration-test",
    });
    scheduleId = schedule.id;
    await adminStore.approveAndSchedule({
      tenantId, applicationId, scheduleId, actorId: "integration-test",
      nextRunAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const idempotencyKey = "worker-login:duplicate:" + randomUUID();
    const input = {
      tenantId, applicationId, scheduleId,
      scheduledFor: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey,
      payload: { integrationTest: true, immutableIdentity: "original" },
    };
    const first = await store.enqueueExecution(input);
    const duplicate = await store.enqueueExecution({
      ...input,
      payload: { integrationTest: true, immutableIdentity: "must-not-replace-original" },
    });
    assert.ok(first, "The dedicated worker LOGIN role must be able to enqueue");
    assert.ok(duplicate, "The dedicated worker LOGIN role must be able to read an idempotency conflict");
    assert.equal(duplicate.id, first.id);
    assert.deepEqual(duplicate.payload, input.payload);

    const persisted = await adminPool.query(
      `SELECT id, payload, idempotency_key FROM eper_campaign_executions
       WHERE tenant_id=$1 AND application_id=$2 AND idempotency_key=$3`,
      [tenantId, applicationId, idempotencyKey],
    );
    assert.equal(persisted.rowCount, 1);
    assert.equal(String(persisted.rows[0].id), first.id);
    assert.equal(persisted.rows[0].idempotency_key, idempotencyKey);
    assert.deepEqual(persisted.rows[0].payload, input.payload);
  } finally {
    if (scheduleId) {
      await adminPool.query(
        "DELETE FROM eper_campaign_executions WHERE tenant_id=$1 AND application_id=$2 AND schedule_id=$3",
        [tenantId, applicationId, scheduleId],
      );
      await adminPool.query(
        "DELETE FROM eper_campaign_schedules WHERE tenant_id=$1 AND application_id=$2 AND id=$3",
        [tenantId, applicationId, scheduleId],
      );
    }
    await workerPool.end();
    await adminPool.end();
  }
});
   }
 });


test("dedicated scheduler LOGIN role materializes, claims, fences, completes and audits a one-time execution", {
  skip: !enabled || !workerDatabaseUrl
    ? "Set isolated admin and EPER_CAMPAIGN_SCHEDULER_WORKER_TEST_DATABASE_URL connections"
    : false,
}, async () => {
  const adminParsed = new URL(databaseUrl);
  const workerParsed = new URL(workerDatabaseUrl);
  const databaseName = decodeURIComponent(adminParsed.pathname.slice(1));
  assert.match(databaseName, /(^|[_-])(test|ci|sandbox)([_-]|$)/i,
    "Refusing to exercise worker lifecycle outside a disposable test/CI/sandbox database");
  assert.equal(workerParsed.pathname, adminParsed.pathname,
    "Admin and worker URLs must target the same disposable database");

  const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3000 });
  const workerPool = new pg.Pool({ connectionString: workerDatabaseUrl, max: 3, connectionTimeoutMillis: 3000 });
  const tenantId = "scheduler-worker-lifecycle-" + randomUUID();
  const applicationId = "app-worker-lifecycle-" + randomUUID();
  const workerId = "worker-login-lifecycle-" + randomUUID();
  const adminStore = new PostgresCampaignSchedulerStore(adminPool, "sandbox", "worker-login-lifecycle-setup");
  const workerStore = new PostgresCampaignSchedulerStore(workerPool, "sandbox", "worker-login-lifecycle");
  let scheduleId;
  try {
    const identity = await workerPool.query("SELECT current_user AS role_name");
    assert.equal(identity.rows[0]?.role_name, "eper_campaign_scheduler_worker_runtime");

    const schedule = await adminStore.createSchedule({
      tenantId, applicationId, campaignId: "campaign-worker-lifecycle",
      triggerType: "once", timezone: "UTC",
      scheduleDefinition: { at: "2035-01-01T00:00:00Z" }, createdBy: "integration-test",
    });
    scheduleId = schedule.id;
    const nextRunAt = new Date(Date.now() + 1200).toISOString();
    await adminStore.approveAndSchedule({
      tenantId, applicationId, scheduleId, actorId: "integration-test", nextRunAt,
    });

    await new Promise((resolve) => setTimeout(resolve, Math.max(0, Date.parse(nextRunAt) - Date.now() + 100)));
    assert.equal(await workerStore.materializeDueOneTimeSchedules(), 1,
      "Worker LOGIN role must materialize the due one-time schedule");

    const claimed = await workerStore.claimExecutions(workerId, 1);
    assert.equal(claimed.length, 1, "Worker LOGIN role must claim the durable execution");
    const execution = claimed[0];
    assert.equal(execution.status, "running");
    assert.equal(execution.claimGeneration, 1);

    const fenced = await workerStore.beginExecutionDispatch({
      tenantId, applicationId, executionId: execution.id, workerId,
      claimGeneration: execution.claimGeneration,
    });
    assert.equal(fenced, true, "Worker LOGIN role must acquire the atomic dispatch fence");

    const completed = await workerStore.completeExecution({
      tenantId, applicationId, executionId: execution.id, workerId,
      claimGeneration: execution.claimGeneration,
      result: { integrationTest: true, completedBy: "dedicated-worker-login" },
    });
    assert.equal(completed, true, "Worker LOGIN role must complete its claimed execution");

    const persisted = await adminPool.query(
      "SELECT status, dispatch_started_at, result FROM eper_campaign_executions WHERE id=$1 AND tenant_id=$2 AND application_id=$3",
      [execution.id, tenantId, applicationId],
    );
    assert.equal(persisted.rowCount, 1);
    assert.equal(persisted.rows[0].status, "succeeded");
    assert.ok(persisted.rows[0].dispatch_started_at);
    assert.deepEqual(persisted.rows[0].result, {
      integrationTest: true, completedBy: "dedicated-worker-login",
    });

    const audit = await adminPool.query(
      "SELECT action FROM eper_audit_events WHERE tenant_id=$1 AND application_id=$2 AND resource_id=$3 ORDER BY occurred_at, event_id",
      [tenantId, applicationId, execution.id],
    );
    assert.deepEqual(
      audit.rows.map((row) => row.action).sort(),
      ["campaign_execution_claimed", "campaign_execution_dispatch_started", "campaign_execution_succeeded"].sort(),
      "Worker lifecycle must append claim, dispatch-fence and completion audit events",
    );
  } finally {
    if (scheduleId) {
      await adminPool.query(
        "DELETE FROM eper_campaign_executions WHERE tenant_id=$1 AND application_id=$2 AND schedule_id=$3",
        [tenantId, applicationId, scheduleId],
      );
      await adminPool.query(
        "DELETE FROM eper_campaign_schedules WHERE tenant_id=$1 AND application_id=$2 AND id=$3",
        [tenantId, applicationId, scheduleId],
      );
    }
    await workerPool.end();
    await adminPool.end();
  }
});
