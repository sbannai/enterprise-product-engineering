import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresAgentStore } from "../dist/packages/agents/postgres-agent-store.js";
import { processAgentJobOnce } from "../dist/packages/agents/agent-worker.js";
import { assertAuditStoreReady, verifyAuditChain } from "../dist/packages/audit/audit-event-store.js";

const databaseUrl = process.env.EPER_AGENT_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
test("PostgreSQL agent worker persists drafts, recovers expired leases and enforces maker-checker", {
  skip: !databaseUrl ? "Set EPER_AGENT_TEST_DATABASE_URL to an isolated, migrated PostgreSQL test database" : false,
}, async () => {
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  assert.match(databaseName, /(^|[_-])(test|ci|sandbox)([_-]|$)/i,
    "Refusing to run against a database whose name does not clearly identify it as test/CI/sandbox");

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 3000 });
  const tenantId = "agent-worker-test-" + randomUUID();
  const applicationId = "app-agent-worker-" + randomUUID();
  const workerId = "agent-worker-integration";
  const environment = "sandbox";
  const store = new PostgresAgentStore(pool);
  const jobIds = [];
  try {
    const schema = await pool.query(`
      SELECT to_regclass('public.eper_agent_jobs') AS jobs,
             to_regclass('public.eper_agent_job_drafts') AS drafts,
             to_regclass('public.eper_agent_approvals') AS approvals,
             to_regclass('public.eper_agent_configurations') AS configurations
    `);
    assert.ok(schema.rows[0]?.jobs && schema.rows[0]?.drafts && schema.rows[0]?.approvals && schema.rows[0]?.configurations,
      "Apply migrate:audit and migrate:capabilities before running this integration test");
    await assertAuditStoreReady(pool);

    const created = await store.enqueueJob({
      tenantId, applicationId, requestedBy: "agent-maker",
      agentId: "sales", intent: "follow-up",
      input: { objective: "PostgreSQL worker lifecycle" },
      idempotencyKey: "agent-worker-integration:" + randomUUID(),
      correlationId: "agent-enqueue-" + randomUUID(), environment,
    });
    assert.equal(created.kind, "created");
    jobIds.push(created.job.jobId);

    const processed = await processAgentJobOnce({
      store, tenantId, applicationId, workerId, environment,
      leaseSeconds: 30, maxAttempts: 3,
    });
    assert.equal(processed.outcome, "draft_created");
    if (processed.outcome !== "draft_created") return;
    const job = await store.getJob({ tenantId, applicationId, jobId: processed.jobId });
    assert.equal(job?.status, "awaiting_approval");
    const draft = await store.getDraft({ tenantId, applicationId, draftId: processed.draftId });
    assert.equal(draft?.status, "pending_approval");
    assert.equal(draft?.created_by, "agent-maker");
    assert.ok(draft?.content_hash);

    await assert.rejects(
      store.reviewDraft({
        tenantId, applicationId, draftId: processed.draftId,
        reviewerId: "agent-maker", reviewerRole: "reviewer",
        action: "approve", expectedVersion: 1,
        expectedContentHash: String(draft.content_hash),
        correlationId: "agent-self-review-" + randomUUID(), environment,
      }),
      /MAKER_CHECKER_SEPARATION_REQUIRED/,
    );
    const approved = await store.reviewDraft({
      tenantId, applicationId, draftId: processed.draftId,
      reviewerId: "independent-reviewer", reviewerRole: "application-admin",
      action: "approve", expectedVersion: 1,
      expectedContentHash: String(draft.content_hash),
      correlationId: "agent-review-" + randomUUID(), environment,
    });
    assert.equal(approved.status, "approved");
    assert.equal((await store.getJob({ tenantId, applicationId, jobId: processed.jobId }))?.status, "succeeded");

    const retryJob = await store.enqueueJob({
      tenantId, applicationId, requestedBy: "agent-maker",
      agentId: "crm", intent: "lead-qualification",
      input: { context: "lease recovery integration test" },
      idempotencyKey: "agent-lease-recovery:" + randomUUID(),
      correlationId: "agent-retry-enqueue-" + randomUUID(), environment,
    });
    assert.equal(retryJob.kind, "created");
    jobIds.push(retryJob.job.jobId);
    const firstClaim = await store.claimNextJob({
      tenantId, applicationId, workerId: "worker-before-restart",
      environment, leaseSeconds: 30,
    });
    assert.equal(firstClaim?.jobId, retryJob.job.jobId);
    assert.equal(firstClaim?.attempt, 1);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id',$1,true),set_config('eper.application_id',$2,true)", [tenantId, applicationId]);
      await client.query(
        "UPDATE eper_agent_jobs SET lease_expires_at=NOW()-interval '1 second' WHERE tenant_id=$1 AND application_id=$2 AND job_id=$3",
        [tenantId, applicationId, retryJob.job.jobId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }

    const replacementClaim = await store.claimNextJob({
      tenantId, applicationId, workerId: "worker-after-restart",
      environment, leaseSeconds: 30,
    });
    assert.equal(replacementClaim?.jobId, retryJob.job.jobId);
    assert.equal(replacementClaim?.attempt, 2);
    const terminal = await store.failOrRetryJob({
      tenantId, applicationId, jobId: retryJob.job.jobId,
      workerId: "worker-after-restart", failureCode: "INTEGRATION_TERMINAL_FAILURE",
      retryable: false, maxAttempts: 3, environment,
      correlationId: "agent-terminal-" + randomUUID(),
    });
    assert.equal(terminal.status, "failed");

    const audit = await verifyAuditChain(pool);
    assert.equal(audit.valid, true, audit.errors.join(","));
    assert.ok(audit.eventsChecked >= 6, "Expected enqueue, claim, draft, review and retry lifecycle audit events");
  } finally {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id',$1,true),set_config('eper.application_id',$2,true)", [tenantId, applicationId]);
      await client.query("DELETE FROM eper_agent_approvals WHERE tenant_id=$1 AND application_id=$2", [tenantId, applicationId]);
      await client.query("DELETE FROM eper_agent_job_drafts WHERE tenant_id=$1 AND application_id=$2", [tenantId, applicationId]);
      await client.query("DELETE FROM eper_agent_jobs WHERE tenant_id=$1 AND application_id=$2", [tenantId, applicationId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }
});
