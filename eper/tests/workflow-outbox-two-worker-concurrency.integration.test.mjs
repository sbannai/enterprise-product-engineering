import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";
import { PostgresWorkflowOutboxStore } from "../dist/packages/workflows/postgres-workflow-outbox-store.js";
import { assertRestrictedWorkerDatabaseRole } from "../dist/packages/workflows/workflow-outbox-worker-database.js";

const workerUrlA = process.env.EPER_WORKFLOW_OUTBOX_TEST_DATABASE_URL;
const workerUrlB = process.env.EPER_WORKFLOW_OUTBOX_TEST_DATABASE_URL_B;
const roleA = process.env.EPER_WORKFLOW_OUTBOX_EXPECTED_DATABASE_ROLE;
const roleB = process.env.EPER_WORKFLOW_OUTBOX_EXPECTED_DATABASE_ROLE_B;
const adminUrl = process.env.DATABASE_URL;

test("two independent restricted PostgreSQL logins cannot claim the same event and stale owner cannot acknowledge takeover", {
  skip: !workerUrlA || !workerUrlB || !roleA || !roleB || !adminUrl,
}, async () => {
  assert.notEqual(roleA, roleB, "the competing workers must use distinct PostgreSQL login roles");
  const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
  const poolA = new pg.Pool({
    connectionString: workerUrlA, max: 2, connectionTimeoutMillis: 5000,
    application_name: "eper-outbox-concurrency-worker-a",
  });
  const poolB = new pg.Pool({
    connectionString: workerUrlB, max: 2, connectionTimeoutMillis: 5000,
    application_name: "eper-outbox-concurrency-worker-b",
  });
  const token = randomUUID();
  const tenantId = "tenant-race-" + token;
  const applicationId = "app-race-" + token;
  const workflowId = "workflow-race";
  const instanceId = randomUUID();
  const transitionId = randomUUID();
  const eventId = randomUUID();
  const digest = createHash("sha256").update(token).digest("hex");
  const context = { tenantId, applicationId };
  const storeA = new PostgresWorkflowOutboxStore(poolA);
  const storeB = new PostgresWorkflowOutboxStore(poolB);

  try {
    const [identityA, identityB] = await Promise.all([
      poolA.query("SELECT current_user AS role_name"),
      poolB.query("SELECT current_user AS role_name"),
    ]);
    assert.equal(identityA.rows[0].role_name, roleA);
    assert.equal(identityB.rows[0].role_name, roleB);
    assert.notEqual(identityA.rows[0].role_name, identityB.rows[0].role_name);
    await Promise.all([
      assertRestrictedWorkerDatabaseRole(poolA, roleA),
      assertRestrictedWorkerDatabaseRole(poolB, roleB),
    ]);

    await admin.query(
      `INSERT INTO public.eper_workflow_definition_versions
        (tenant_id, application_id, workflow_id, definition_version, definition,
         definition_digest, publication_status, published_by)
       VALUES ($1,$2,$3,1,'{}'::jsonb,$4,'active','two-worker-concurrency-test')`,
      [tenantId, applicationId, workflowId, digest],
    );
    await admin.query(
      `INSERT INTO public.eper_workflow_instances
        (tenant_id, application_id, instance_id, workflow_id, definition_version,
         definition_digest, status, current_activity_id, data, version, created_by)
       VALUES ($1,$2,$3,$4,1,$5,'running','start','{}'::jsonb,1,'two-worker-concurrency-test')`,
      [tenantId, applicationId, instanceId, workflowId, digest],
    );
    await admin.query(
      `INSERT INTO public.eper_workflow_transitions
        (tenant_id, application_id, transition_id, instance_id, action, actor_id,
         expected_version, resulting_version, idempotency_key, request_fingerprint, correlation_id)
       VALUES ($1,$2,$3,$4,'start','two-worker-concurrency-test',0,1,$5,$6,$7)`,
      [tenantId, applicationId, transitionId, instanceId, "race-" + token, digest, token],
    );
    await admin.query(
      `INSERT INTO public.eper_workflow_outbox_events
        (tenant_id, application_id, event_id, instance_id, transition_id,
         event_type, event_version, payload)
       VALUES ($1,$2,$3,$4,$5,'workflow.instance.started',1,'{}'::jsonb)`,
      [tenantId, applicationId, eventId, instanceId, transitionId],
    );
    await admin.query(
      `INSERT INTO public.eper_workflow_outbox_delivery
        (tenant_id, application_id, event_id) VALUES ($1,$2,$3)`,
      [tenantId, applicationId, eventId],
    );

    const workerIdA = "worker-race-a";
    const workerIdB = "worker-race-b";
    const [claimA, claimB] = await Promise.all([
      storeA.claim(context, { workerId: workerIdA, limit: 1, leaseSeconds: 10 }),
      storeB.claim(context, { workerId: workerIdB, limit: 1, leaseSeconds: 10 }),
    ]);
    assert.equal(claimA.length + claimB.length, 1, "SKIP LOCKED must allow exactly one concurrent owner");
    const first = claimA.length ? claimA[0] : claimB[0];
    const firstStore = claimA.length ? storeA : storeB;
    const firstWorkerId = claimA.length ? workerIdA : workerIdB;
    const takeoverStore = claimA.length ? storeB : storeA;
    const takeoverWorkerId = claimA.length ? workerIdB : workerIdA;
    assert.equal(first.claimGeneration, 1);

    await admin.query(
      `UPDATE public.eper_workflow_outbox_delivery
          SET locked_at = clock_timestamp() - INTERVAL '30 seconds'
        WHERE tenant_id = $1 AND application_id = $2 AND event_id = $3`,
      [tenantId, applicationId, eventId],
    );
    const takeover = await takeoverStore.claim(context, {
      workerId: takeoverWorkerId, limit: 1, leaseSeconds: 10,
    });
    assert.equal(takeover.length, 1);
    assert.equal(takeover[0].claimGeneration, 2);

    assert.equal(await firstStore.renewLease(
      context, eventId, firstWorkerId, 10, first.claimGeneration,
    ), false);
    await assert.rejects(
      () => firstStore.markDelivered(context, eventId, firstWorkerId, first.claimGeneration),
      /WORKFLOW_OUTBOX_LEASE_NOT_HELD/,
    );
    await assert.rejects(
      () => firstStore.markFailed(context, eventId, {
        workerId: firstWorkerId,
        claimGeneration: first.claimGeneration,
        maxAttempts: 8,
        retryDelaySeconds: 1,
        error: "stale concurrent worker",
      }),
      /WORKFLOW_OUTBOX_LEASE_NOT_HELD/,
    );

    await takeoverStore.markDelivered(context, eventId, takeoverWorkerId, takeover[0].claimGeneration);
    const final = await admin.query(
      `SELECT delivery_status, claim_generation, attempts
         FROM public.eper_workflow_outbox_delivery
        WHERE tenant_id = $1 AND application_id = $2 AND event_id = $3`,
      [tenantId, applicationId, eventId],
    );
    assert.deepEqual(final.rows[0], {
      delivery_status: "delivered",
      claim_generation: "2",
      attempts: 2,
    });
  } finally {
    await poolA.end();
    await poolB.end();
    await admin.end();
  }
});
