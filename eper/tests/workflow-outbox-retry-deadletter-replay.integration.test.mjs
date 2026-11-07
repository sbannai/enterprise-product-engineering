import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";
import { PostgresWorkflowOutboxStore } from "../dist/packages/workflows/postgres-workflow-outbox-store.js";
import { WorkflowOutboxWorker } from "../dist/packages/workflows/workflow-outbox-worker.js";
import { replayWorkflowOutboxDeadLetter } from "../dist/packages/workflows/workflow-outbox-dead-letter-replay.js";

const workerUrlA = process.env.EPER_WORKFLOW_OUTBOX_TEST_DATABASE_URL;
const workerUrlB = process.env.EPER_WORKFLOW_OUTBOX_TEST_DATABASE_URL_B;
const adminUrl = process.env.DATABASE_URL;

test("two restricted workers retry, dead-letter, audit-replay and redeliver one event idempotently", {
  skip: !workerUrlA || !workerUrlB || !adminUrl,
}, async () => {
  const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
  const poolA = new pg.Pool({
    connectionString: workerUrlA, max: 2, connectionTimeoutMillis: 5000,
    application_name: "eper-outbox-lifecycle-worker-a",
  });
  const poolB = new pg.Pool({
    connectionString: workerUrlB, max: 2, connectionTimeoutMillis: 5000,
    application_name: "eper-outbox-lifecycle-worker-b",
  });
  const token = randomUUID();
  const tenantId = "tenant-life-" + token;
  const applicationId = "app-life-" + token;
  const actorId = "operator-01";
  const workflowId = "workflow-lifecycle";
  const instanceId = randomUUID();
  const transitionId = randomUUID();
  const eventId = randomUUID();
  const correlationId = randomUUID();
  const digest = createHash("sha256").update(token).digest("hex");
  const context = { tenantId, applicationId };
  const storeA = new PostgresWorkflowOutboxStore(poolA);
  const storeB = new PostgresWorkflowOutboxStore(poolB);
  const workerA = new WorkflowOutboxWorker(storeA, {
    async dispatch() { throw new Error("synthetic transient receiver failure"); },
  }, { workerId: "worker-life-a", maxAttempts: 2, baseRetryDelaySeconds: 0, maxRetryDelaySeconds: 1 });
  const workerB = new WorkflowOutboxWorker(storeB, {
    async dispatch() { throw new Error("synthetic transient receiver failure"); },
  }, { workerId: "worker-life-b", maxAttempts: 2, baseRetryDelaySeconds: 0, maxRetryDelaySeconds: 1 });
  const delivered = new Set();
  const replayWorker = new WorkflowOutboxWorker(storeA, {
    async dispatch(event) {
      // Synthetic sink only: no network or provider calls.
      delivered.add(event.eventId);
    },
  }, { workerId: "worker-life-replay", maxAttempts: 8, baseRetryDelaySeconds: 0, maxRetryDelaySeconds: 1 });

  try {
    await admin.query(
      `INSERT INTO public.eper_tenant_application_assignment
        (tenant_id, application_id, assigned_by, updated_by)
       VALUES ($1,$2,'lifecycle-test','lifecycle-test')`,
      [tenantId, applicationId],
    );
    await admin.query(
      `INSERT INTO public.eper_actor_application_assignment
        (tenant_id, actor_id, application_id, assigned_by, updated_by)
       VALUES ($1,$2,$3,'lifecycle-test','lifecycle-test')`,
      [tenantId, actorId, applicationId],
    );
    await admin.query(
      `INSERT INTO public.eper_workflow_role_definition
        (tenant_id, application_id, role_id, name, permissions, created_by, updated_by)
       VALUES ($1,$2,'workflow-admin','Workflow Admin','["workflow:admin"]'::jsonb,'lifecycle-test','lifecycle-test')`,
      [tenantId, applicationId],
    );
    await admin.query(
      `INSERT INTO public.eper_workflow_actor_role_assignment
        (tenant_id, application_id, actor_id, role_id, assigned_by, updated_by)
       VALUES ($1,$2,$3,'workflow-admin','lifecycle-test','lifecycle-test')`,
      [tenantId, applicationId, actorId],
    );
    await admin.query(
      `INSERT INTO public.eper_workflow_definition_versions
        (tenant_id, application_id, workflow_id, definition_version, definition,
         definition_digest, publication_status, published_by)
       VALUES ($1,$2,$3,1,'{}'::jsonb,$4,'active','lifecycle-test')`,
      [tenantId, applicationId, workflowId, digest],
    );
    await admin.query(
      `INSERT INTO public.eper_workflow_instances
        (tenant_id, application_id, instance_id, workflow_id, definition_version,
         definition_digest, status, current_activity_id, data, version, created_by)
       VALUES ($1,$2,$3,$4,1,$5,'running','start','{}'::jsonb,1,'lifecycle-test')`,
      [tenantId, applicationId, instanceId, workflowId, digest],
    );
    await admin.query(
      `INSERT INTO public.eper_workflow_transitions
        (tenant_id, application_id, transition_id, instance_id, action, actor_id,
         expected_version, resulting_version, idempotency_key, request_fingerprint, correlation_id)
       VALUES ($1,$2,$3,$4,'start','lifecycle-test',0,1,$5,$6,$7)`,
      [tenantId, applicationId, transitionId, instanceId, "life-" + token, digest, correlationId],
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

    const first = await workerA.runOnce(context, 1);
    assert.deepEqual(first, {
      claimed: 1, delivered: 0, retried: 1, deadLettered: 0, leaseLost: 0, interrupted: 0,
    });
    const second = await workerB.runOnce(context, 1);
    assert.deepEqual(second, {
      claimed: 1, delivered: 0, retried: 0, deadLettered: 1, leaseLost: 0, interrupted: 0,
    });

    const replayContext = {
      tenantId, applicationId, actorId, correlationId, environment: "sandbox",
    };
    const replayInput = {
      eventId,
      workerId: "operator-console",
      reason: "Synthetic receiver recovered; integration replay",
      idempotencyKey: "lifecycle-replay-" + token.slice(0, 24),
    };
    const replay = await replayWorkflowOutboxDeadLetter(admin, replayContext, replayInput);
    assert.equal(replay.eventId, eventId);
    assert.equal(replay.priorAttempts, 2);
    assert.equal(replay.alreadyApplied, false);

    const duplicateReplay = await replayWorkflowOutboxDeadLetter(admin, replayContext, replayInput);
    assert.equal(duplicateReplay.replayId, replay.replayId);
    assert.equal(duplicateReplay.alreadyApplied, true);

    const replayed = await replayWorker.runOnce(context, 1);
    assert.deepEqual(replayed, {
      claimed: 1, delivered: 1, retried: 0, deadLettered: 0, leaseLost: 0, interrupted: 0,
    });
    const noDuplicate = await replayWorker.runOnce(context, 1);
    assert.equal(noDuplicate.claimed, 0);
    assert.deepEqual([...delivered], [eventId]);

    const final = await admin.query(
      `SELECT delivery_status, attempts, claim_generation
         FROM public.eper_workflow_outbox_delivery
        WHERE tenant_id = $1 AND application_id = $2 AND event_id = $3`,
      [tenantId, applicationId, eventId],
    );
    assert.deepEqual(final.rows[0], {
      delivery_status: "delivered",
      attempts: 3,
      claim_generation: "3",
    });
    const replayRows = await admin.query(
      `SELECT count(*)::int AS count
         FROM public.eper_workflow_outbox_replay_audit
        WHERE tenant_id = $1 AND application_id = $2 AND event_id = $3`,
      [tenantId, applicationId, eventId],
    );
    assert.equal(replayRows.rows[0].count, 1);
    const auditRows = await admin.query(
      `SELECT count(*)::int AS count
         FROM public.eper_audit_events
        WHERE tenant_id = $1 AND application_id = $2
          AND action = 'workflow.outbox.dead_letter.replayed'
          AND resource_id = $3`,
      [tenantId, applicationId, eventId],
    );
    assert.equal(auditRows.rows[0].count, 1);
  } finally {
    await poolA.end();
    await poolB.end();
    await admin.end();
  }
});
