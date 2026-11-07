import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";
import { PostgresWorkflowOutboxStore } from "../dist/packages/workflows/postgres-workflow-outbox-store.js";

const workerUrl = process.env.EPER_WORKFLOW_OUTBOX_TEST_DATABASE_URL;
const adminUrl = process.env.DATABASE_URL;

test("PostgreSQL claim generation fences stale acknowledgements after same-worker-id lease takeover", {
  skip: !workerUrl || !adminUrl,
}, async () => {
  const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
  const workerPool = new pg.Pool({
    connectionString: workerUrl,
    max: 2,
    connectionTimeoutMillis: 5000,
    application_name: "eper-workflow-outbox-claim-fencing-test",
  });
  const token = randomUUID();
  const tenantId = "tenant-fence-" + token;
  const applicationId = "app-fence-" + token;
  const workflowId = "workflow-fence";
  const instanceId = randomUUID();
  const transitionId = randomUUID();
  const eventId = randomUUID();
  const digest = createHash("sha256").update(token).digest("hex");
  const context = { tenantId, applicationId };
  const store = new PostgresWorkflowOutboxStore(workerPool);

  try {
    await admin.query(
      `INSERT INTO public.eper_workflow_definition_versions
        (tenant_id, application_id, workflow_id, definition_version, definition,
         definition_digest, publication_status, published_by)
       VALUES ($1,$2,$3,1,'{}'::jsonb,$4,'active','claim-fencing-test')`,
      [tenantId, applicationId, workflowId, digest],
    );
    await admin.query(
      `INSERT INTO public.eper_workflow_instances
        (tenant_id, application_id, instance_id, workflow_id, definition_version,
         definition_digest, status, current_activity_id, data, version, created_by)
       VALUES ($1,$2,$3,$4,1,$5,'running','start','{}'::jsonb,1,'claim-fencing-test')`,
      [tenantId, applicationId, instanceId, workflowId, digest],
    );
    await admin.query(
      `INSERT INTO public.eper_workflow_transitions
        (tenant_id, application_id, transition_id, instance_id, action, actor_id,
         expected_version, resulting_version, idempotency_key, request_fingerprint, correlation_id)
       VALUES ($1,$2,$3,$4,'start','claim-fencing-test',0,1,$5,$6,$7)`,
      [tenantId, applicationId, transitionId, instanceId, "fence-" + token, digest, token],
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
        (tenant_id, application_id, event_id)
       VALUES ($1,$2,$3)`,
      [tenantId, applicationId, eventId],
    );

    // Simulate process restart/reclaim using the same stable worker ID.
    const workerId = "worker-fence-01";
    const first = await store.claim(context, { workerId, limit: 1, leaseSeconds: 10 });
    assert.equal(first.length, 1);
    assert.equal(first[0].claimGeneration, 1);

    await admin.query(
      `UPDATE public.eper_workflow_outbox_delivery
          SET locked_at = clock_timestamp() - INTERVAL '30 seconds'
        WHERE tenant_id = $1 AND application_id = $2 AND event_id = $3`,
      [tenantId, applicationId, eventId],
    );

    const takeover = await store.claim(context, { workerId, limit: 1, leaseSeconds: 10 });
    assert.equal(takeover.length, 1);
    assert.equal(takeover[0].claimGeneration, 2);

    assert.equal(await store.renewLease(context, eventId, workerId, 10, first[0].claimGeneration), false);
    await assert.rejects(
      () => store.markDelivered(context, eventId, workerId, first[0].claimGeneration),
      /WORKFLOW_OUTBOX_LEASE_NOT_HELD/,
    );
    await assert.rejects(
      () => store.markFailed(context, eventId, {
        workerId,
        claimGeneration: first[0].claimGeneration,
        maxAttempts: 8,
        retryDelaySeconds: 1,
        error: "stale process failure",
      }),
      /WORKFLOW_OUTBOX_LEASE_NOT_HELD/,
    );

    await store.markDelivered(context, eventId, workerId, takeover[0].claimGeneration);
    const finalState = await admin.query(
      `SELECT delivery_status, claim_generation, attempts
         FROM public.eper_workflow_outbox_delivery
        WHERE tenant_id = $1 AND application_id = $2 AND event_id = $3`,
      [tenantId, applicationId, eventId],
    );
    assert.deepEqual(finalState.rows[0], {
      delivery_status: "delivered",
      claim_generation: "2",
      attempts: 2,
    });
  } finally {
    await workerPool.end();
    await admin.end();
  }
});
