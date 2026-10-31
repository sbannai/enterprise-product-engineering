import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPostgresPaymentPool } from "../dist/packages/payments/postgres-payment-runtime.js";
import { PostgresWorkflowRoleDefinitionStore } from "../dist/packages/workflows/postgres-workflow-role-definition-store.js";
import { PostgresWorkflowActorRoleAssignmentStore } from "../dist/packages/workflows/postgres-workflow-actor-role-assignment-store.js";
import { WorkflowDefinitionPublisher } from "../dist/packages/workflows/workflow-definition-publisher.js";
import { PostgresWorkflowExecutionService } from "../dist/packages/workflows/postgres-workflow-execution-service.js";
import { PostgresWorkflowOutboxStore } from "../dist/packages/workflows/postgres-workflow-outbox-store.js";

const databaseConfigured = Boolean(process.env.EPER_PAYMENT_DATABASE_URL || process.env.DATABASE_URL);

test("PostgreSQL workflow start, transition, idempotency and audit survive service recreation",
  { skip: !databaseConfigured },
  async () => {
    const pool = createPostgresPaymentPool();
    const suffix = randomUUID();
    const tenantId = "wf-tenant-" + suffix;
    const applicationId = "wf-app-" + suffix;
    const actorId = "wf-actor-" + suffix;
    const roleId = "employee";
    const workflowId = "wf-expense-" + suffix;
    const correlationId = "wf-corr-" + suffix;
    const environment = "uat";

    const roleStore = new PostgresWorkflowRoleDefinitionStore(pool);
    const assignmentStore = new PostgresWorkflowActorRoleAssignmentStore(pool);
    const publisher = new WorkflowDefinitionPublisher(pool);
    const service = new PostgresWorkflowExecutionService(pool, "workflow-integration-test");

    try {
      await roleStore.assertReady();
      await assignmentStore.assertReady();
      await service.assertReady();
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO eper_tenant_application_assignment
            (tenant_id, application_id, assignment_status, assigned_by, updated_by)
           VALUES ($1,$2,'active',$3,$3)`,
          [tenantId, applicationId, actorId],
        );
        await client.query(
          `INSERT INTO eper_actor_application_assignment
            (tenant_id, actor_id, application_id, assignment_status, assigned_by, updated_by)
           VALUES ($1,$2,$3,'active',$2,$2)`,
          [tenantId, actorId, applicationId],
        );
      } finally { client.release(); }

      await roleStore.replace({
        tenantId, applicationId, roleId, name: "Employee",
        permissions: ["workflow:view", "workflow:act"], status: "active",
        expectedVersion: 0, changedBy: actorId, environment, correlationId,
      });
      await roleStore.replace({
        tenantId, applicationId, roleId: "finance-approver", name: "Finance approver",
        permissions: ["workflow:view", "workflow:approve"], status: "active",
        expectedVersion: 0, changedBy: actorId, environment, correlationId,
      });
      await assignmentStore.assign({
        tenantId, applicationId, actorId, roleId, changedBy: actorId,
        expectedVersion: 0, environment, correlationId,
      });
      await assignmentStore.assign({
        tenantId, applicationId, actorId, roleId: "finance-approver", changedBy: actorId,
        expectedVersion: 0, environment, correlationId,
      });

      const definition = {
        id: workflowId, name: "Expense submission", status: "ACTIVE",
        activities: [{
          id: "submit-expense", title: "Submit expense", type: "TASK",
          roleId, permission: "workflow:act", nextActivityIds: ["approve-expense"], fields: [],
        }, {
          id: "approve-expense", title: "Approve expense", type: "APPROVAL",
          roleId: "finance-approver", permission: "workflow:approve", nextActivityIds: [], fields: [],
        }],
      };
      const published = await publisher.publish({
        tenantId, applicationId, principalId: actorId, correlationId, environment,
      }, definition);
      assert.equal(published.definitionVersion, 1);

      const startInput = {
        tenantId, applicationId, actorId, correlationId, environment,
        workflowId, idempotencyKey: "start-" + suffix, businessReference: "EXP-" + suffix, data: {},
      };
      const concurrentStarts = await Promise.all([service.start(startInput), service.start(startInput)]);
      const started = concurrentStarts[0];
      assert.equal(concurrentStarts[1].instanceId, started.instanceId);
      assert.equal(started.status, "running");
      assert.equal(started.version, 1);
      assert.equal(started.currentActivityId, "submit-expense");

      const transitionInput = {
        tenantId, applicationId, actorId, correlationId, environment,
        instanceId: started.instanceId, expectedVersion: 1,
        idempotencyKey: "transition-" + suffix, action: "submit", payload: {},
      };

      // Establish valid memberships in a different application and tenant; neither scope
      // may read or mutate the original instance, even when the instance UUID is known.
      const otherTenantId = "wf-tenant-other-" + suffix;
      const otherApplicationId = "wf-app-other-" + suffix;
      const otherActorId = "wf-actor-other-" + suffix;
      const isolationClient = await pool.connect();
      try {
        await isolationClient.query(
          `INSERT INTO eper_tenant_application_assignment
            (tenant_id, application_id, assignment_status, assigned_by, updated_by)
           VALUES ($1,$2,'active',$3,$3), ($4,$5,'active',$6,$6)`,
          [tenantId, otherApplicationId, actorId, otherTenantId, applicationId, otherActorId],
        );
        await isolationClient.query(
          `INSERT INTO eper_actor_application_assignment
            (tenant_id, actor_id, application_id, assignment_status, assigned_by, updated_by)
           VALUES ($1,$2,$3,'active',$2,$2), ($4,$5,$6,'active',$5,$5)`,
          [tenantId, actorId, otherApplicationId, otherTenantId, otherActorId, applicationId],
        );
      } finally { isolationClient.release(); }

      await assert.rejects(
        service.transition({
          ...transitionInput, applicationId: otherApplicationId,
          idempotencyKey: "cross-app-" + suffix,
        }),
        error => error.code === "WORKFLOW_EXECUTION_INSTANCE_NOT_FOUND" && error.statusCode === 404,
      );
      await assert.rejects(
        service.transition({
          ...transitionInput, tenantId: otherTenantId, actorId: otherActorId,
          idempotencyKey: "cross-tenant-" + suffix,
        }),
        error => error.code === "WORKFLOW_EXECUTION_INSTANCE_NOT_FOUND" && error.statusCode === 404,
      );
      const duplicateSubmits = await Promise.all([
        service.transition(transitionInput), service.transition(transitionInput),
      ]);
      const submitted = duplicateSubmits[0];
      assert.equal(duplicateSubmits[1].version, 2);
      assert.equal(submitted.status, "running");
      assert.equal(submitted.version, 2);
      assert.equal(submitted.currentActivityId, "approve-expense");

      const approveInputs = [
        { ...transitionInput, expectedVersion: 2, idempotencyKey: "approve-a-" + suffix, action: "approve" },
        { ...transitionInput, expectedVersion: 2, idempotencyKey: "approve-b-" + suffix, action: "approve" },
      ];
      const approvalResults = await Promise.allSettled(approveInputs.map(input => service.transition(input)));
      const successfulApproval = approvalResults.find(result => result.status === "fulfilled");
      const failedApproval = approvalResults.find(result => result.status === "rejected");
      assert.equal(approvalResults.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(approvalResults.filter(result => result.status === "rejected").length, 1);
      assert.equal(failedApproval.reason.code, "WORKFLOW_EXECUTION_INSTANCE_TERMINAL");
      const completed = successfulApproval.value;
      assert.equal(completed.status, "completed");
      assert.equal(completed.version, 3);
      assert.equal(completed.currentActivityId, null);
      const successfulApprovalIndex = approvalResults.findIndex(result => result.status === "fulfilled");
      const successfulApprovalInput = approveInputs[successfulApprovalIndex];

      // A new service object simulates process recreation; the database is the authority.
      const restartedService = new PostgresWorkflowExecutionService(pool, "workflow-integration-test-restarted");
      const startReplay = await restartedService.start(startInput);
      assert.equal(startReplay.instanceId, started.instanceId);
      assert.equal(startReplay.version, 1);
      const transitionReplay = await restartedService.transition(transitionInput);
      assert.equal(transitionReplay.status, "running");
      assert.equal(transitionReplay.version, 2);
      const approvalReplay = await restartedService.transition(successfulApprovalInput);
      assert.equal(approvalReplay.status, "completed");
      assert.equal(approvalReplay.version, 3);

      const outboxStore = new PostgresWorkflowOutboxStore(pool);
      const outboxContext = { tenantId, applicationId };
      const claimed = await outboxStore.claim(outboxContext, { workerId: "worker-a", limit: 10, leaseSeconds: 60 });
      assert.equal(claimed.length, 3);
      const byType = Object.fromEntries(claimed.map(event => [event.eventType, event]));
      assert.ok(byType["workflow.instance.started"]);
      assert.ok(byType["workflow.instance.submitted"]);
      assert.ok(byType["workflow.instance.completed"]);
      const competingClaim = await outboxStore.claim(outboxContext, { workerId: "worker-b", limit: 10, leaseSeconds: 60 });
      assert.equal(competingClaim.length, 0, "a second worker must not claim unexpired leases");

      await outboxStore.markDelivered(outboxContext, byType["workflow.instance.started"].eventId, "worker-a");
      await outboxStore.markDelivered(outboxContext, byType["workflow.instance.completed"].eventId, "worker-a");
      const firstFailure = await outboxStore.markFailed(outboxContext, byType["workflow.instance.submitted"].eventId, {
        workerId: "worker-a", maxAttempts: 2, retryDelaySeconds: 0, error: "simulated transient delivery failure",
      });
      assert.deepEqual(firstFailure, { status: "pending", attempts: 1 });
      const retry = await outboxStore.claim(outboxContext, { workerId: "worker-b", limit: 10, leaseSeconds: 60 });
      assert.equal(retry.length, 1);
      assert.equal(retry[0].eventType, "workflow.instance.submitted");
      assert.equal(retry[0].attempts, 2);
      const deadLetter = await outboxStore.markFailed(outboxContext, retry[0].eventId, {
        workerId: "worker-b", maxAttempts: 2, retryDelaySeconds: 0, error: "simulated terminal delivery failure",
      });
      assert.deepEqual(deadLetter, { status: "dead_letter", attempts: 2 });

      const verify = await pool.connect();
      try {
        await verify.query("BEGIN");
        await verify.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
        await verify.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
        const instances = await verify.query(
          `SELECT status, version, definition_version, definition_digest
             FROM eper_workflow_instances
            WHERE tenant_id = $1 AND application_id = $2 AND instance_id = $3`,
          [tenantId, applicationId, started.instanceId],
        );
        assert.equal(instances.rows.length, 1);
        assert.equal(instances.rows[0].status, "completed");
        assert.equal(Number(instances.rows[0].version), 3);
        assert.equal(Number(instances.rows[0].definition_version), 1);
        assert.equal(String(instances.rows[0].definition_digest).trim(), published.definitionDigest);

        const transitions = await verify.query(
          `SELECT action FROM eper_workflow_transitions
            WHERE tenant_id = $1 AND application_id = $2 AND instance_id = $3
            ORDER BY resulting_version`,
          [tenantId, applicationId, started.instanceId],
        );
        assert.deepEqual(transitions.rows.map(row => row.action), ["start", "submit", "approve"]);

        const outbox = await verify.query(
          `SELECT event_type, event_version, payload
             FROM eper_workflow_outbox_events
            WHERE tenant_id = $1 AND application_id = $2 AND instance_id = $3
            ORDER BY event_version`,
          [tenantId, applicationId, started.instanceId],
        );
        assert.deepEqual(outbox.rows.map(row => row.event_type), [
          "workflow.instance.started", "workflow.instance.submitted", "workflow.instance.completed",
        ]);
        assert.deepEqual(outbox.rows.map(row => Number(row.event_version)), [1, 2, 3]);
        const deliveries = await verify.query(
          `SELECT delivery_status, attempts FROM eper_workflow_outbox_delivery
            WHERE tenant_id = $1 AND application_id = $2
              AND event_id IN (SELECT event_id FROM eper_workflow_outbox_events
                                WHERE tenant_id = $1 AND application_id = $2 AND instance_id = $3)`,
          [tenantId, applicationId, started.instanceId],
        );
        assert.equal(deliveries.rows.length, 3);
        assert.equal(deliveries.rows.filter(row => row.delivery_status === "delivered").length, 2);
        assert.equal(deliveries.rows.filter(row => row.delivery_status === "dead_letter").length, 1);
        assert.ok(deliveries.rows.every(row => Number(row.attempts) >= 1));

        const audit = await verify.query(
          `SELECT action FROM eper_audit_events
            WHERE tenant_id = $1 AND application_id = $2
              AND resource_type = 'workflow-instance' AND resource_id = $3
            ORDER BY occurred_at`,
          [tenantId, applicationId, started.instanceId],
        );
        assert.deepEqual(audit.rows.map(row => row.action).sort(), [
          "workflow.instance.start", "workflow.instance.transition", "workflow.instance.transition",
        ].sort());
        await verify.query("COMMIT");
      } catch (error) {
        try { await verify.query("ROLLBACK"); } catch { /* preserve original failure */ }
        throw error;
      } finally { verify.release(); }
    } finally {
      // Workflow transition, idempotency, definition and audit ledgers are append-only;
      // the integration database is ephemeral, so test-scoped evidence is retained.
      await pool.end();
    }
  });


test("PostgreSQL action approval ledger enforces scope, immutable decisions and one-use execution claims",
  { skip: !databaseConfigured },
  async () => {
    const pool = createPostgresPaymentPool();
    const suffix = randomUUID();
    const tenantId = "approval-tenant-" + suffix;
    const applicationId = "approval-app-" + suffix;
    const proposalId = "proposal-" + suffix;
    const approvalId = "approval-" + suffix;
    const executionId = randomUUID();
    const decisionId = randomUUID();
    const eventId = randomUUID();
    const payloadHash = "a".repeat(64);
    const idempotencyKey = "approval-idem-" + suffix;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
      await client.query(
        `INSERT INTO eper_action_proposals (
          tenant_id, application_id, proposal_id, proposal_version, action_type,
          side_effect_class, target_type, target_id, requested_by, requester_type,
          payload, payload_hash, idempotency_key, correlation_id, created_at, expires_at
        ) VALUES ($1,$2,$3,1,'crm.contact.update','crm_mutation','contact','contact-1',
          'requester-1','human','{"name":"Updated"}'::jsonb,$4,$5,'corr-1',$6,$7)`,
        [tenantId, applicationId, proposalId, payloadHash, idempotencyKey, now.toISOString(), expiresAt.toISOString()],
      );
      await client.query(
        `INSERT INTO eper_action_approval_grants (
          tenant_id, application_id, approval_id, proposal_id, proposal_version,
          proposal_hash, requested_by, approver_id, approver_type, decided_at, expires_at, policy_version
        ) VALUES ($1,$2,$3,$4,1,$5,'requester-1','approver-1','human',$6,$7,'policy-v1')`,
        [tenantId, applicationId, approvalId, proposalId, payloadHash, now.toISOString(), expiresAt.toISOString()],
      );
      await client.query("SAVEPOINT invalid_approval_actor");
      await assert.rejects(
        client.query(
          `INSERT INTO eper_action_approval_decisions (
            tenant_id, application_id, decision_id, proposal_id, proposal_version,
            proposal_hash, approval_id, decision, actor_id, actor_type, decided_at, expires_at, policy_version
          ) VALUES ($1,$2,$3,$4,1,$5,$6,'approve','different-approver','human',$7,$8,'policy-v1')`,
          [tenantId, applicationId, randomUUID(), proposalId, payloadHash, approvalId, now.toISOString(), expiresAt.toISOString()],
        ),
        /EPER_ACTION_APPROVAL_PROVENANCE_MISMATCH/,
      );
      await client.query("ROLLBACK TO SAVEPOINT invalid_approval_actor");
      await client.query("RELEASE SAVEPOINT invalid_approval_actor");
      await client.query(
        `INSERT INTO eper_action_approval_decisions (
          tenant_id, application_id, decision_id, proposal_id, proposal_version,
          proposal_hash, approval_id, decision, actor_id, actor_type, decided_at, expires_at, policy_version
        ) VALUES ($1,$2,$3,$4,1,$5,$6,'approve','approver-1','human',$7,$8,'policy-v1')`,
        [tenantId, applicationId, decisionId, proposalId, payloadHash, approvalId, now.toISOString(), expiresAt.toISOString()],
      );
      await client.query(
        `INSERT INTO eper_action_execution_claims (
          tenant_id, application_id, execution_id, proposal_id, proposal_version,
          proposal_hash, approval_id, idempotency_key, execution_status,
          attempt_count, worker_id, lease_expires_at
        ) VALUES ($1,$2,$3,$4,1,$5,$6,$7,'processing',1,'worker-1',$8)`,
        [tenantId, applicationId, executionId, proposalId, payloadHash, approvalId, idempotencyKey, expiresAt.toISOString()],
      );
      await client.query(
        `INSERT INTO eper_action_execution_events (
          tenant_id, application_id, event_id, execution_id, approval_id, event_type, worker_id
        ) VALUES ($1,$2,$3,$4,$5,'claimed','worker-1')`,
        [tenantId, applicationId, eventId, executionId, approvalId],
      );

      await client.query("SAVEPOINT expected_rejection");
      await assert.rejects(
        client.query("UPDATE eper_action_proposals SET payload = '{}'::jsonb WHERE tenant_id = $1 AND application_id = $2 AND proposal_id = $3", [tenantId, applicationId, proposalId]),
        /EPER_ACTION_LEDGER_APPEND_ONLY/,
      );
      await client.query("ROLLBACK TO SAVEPOINT expected_rejection");
      await client.query("RELEASE SAVEPOINT expected_rejection");
      await client.query("SAVEPOINT expected_rejection");
      await assert.rejects(
        client.query("UPDATE eper_action_approval_grants SET expires_at = NOW() WHERE tenant_id = $1 AND application_id = $2 AND approval_id = $3", [tenantId, applicationId, approvalId]),
        /EPER_ACTION_LEDGER_APPEND_ONLY/,
      );
      await client.query("ROLLBACK TO SAVEPOINT expected_rejection");
      await client.query("RELEASE SAVEPOINT expected_rejection");
      await client.query("SAVEPOINT expected_rejection");
      await assert.rejects(
        client.query("UPDATE eper_action_approval_decisions SET decision = 'revoke' WHERE tenant_id = $1 AND application_id = $2 AND decision_id = $3", [tenantId, applicationId, decisionId]),
        /EPER_ACTION_LEDGER_APPEND_ONLY/,
      );
      await client.query("ROLLBACK TO SAVEPOINT expected_rejection");
      await client.query("RELEASE SAVEPOINT expected_rejection");
      await client.query("SAVEPOINT expected_rejection");
      await assert.rejects(
        client.query("UPDATE eper_action_execution_events SET event_type = 'failed' WHERE tenant_id = $1 AND application_id = $2 AND event_id = $3", [tenantId, applicationId, eventId]),
        /EPER_ACTION_LEDGER_APPEND_ONLY/,
      );
      await client.query("ROLLBACK TO SAVEPOINT expected_rejection");
      await client.query("RELEASE SAVEPOINT expected_rejection");
      await client.query("SAVEPOINT expected_rejection");
      await assert.rejects(
        client.query("UPDATE eper_action_execution_claims SET approval_id = 'different-approval' WHERE tenant_id = $1 AND application_id = $2 AND execution_id = $3", [tenantId, applicationId, executionId]),
        /EPER_ACTION_EXECUTION_IDENTITY_IMMUTABLE/,
      );
      await client.query("ROLLBACK TO SAVEPOINT expected_rejection");
      await client.query("RELEASE SAVEPOINT expected_rejection");
      await client.query("SAVEPOINT expected_rejection");
      await assert.rejects(
        client.query(
          `INSERT INTO eper_action_execution_claims (
            tenant_id, application_id, execution_id, proposal_id, proposal_version,
            proposal_hash, approval_id, idempotency_key, execution_status,
            attempt_count, worker_id, lease_expires_at
          ) VALUES ($1,$2,$3,$4,1,$5,$6,$7,'processing',1,'worker-2',$8)`,
          [tenantId, applicationId, randomUUID(), proposalId, payloadHash, approvalId, idempotencyKey, expiresAt.toISOString()],
        ),
        /duplicate key|unique constraint/i,
      );
      await client.query("ROLLBACK TO SAVEPOINT expected_rejection");
      await client.query("RELEASE SAVEPOINT expected_rejection");

      await client.query("COMMIT");

      const currentRole = await client.query(
        "SELECT rolsuper FROM pg_roles WHERE rolname = current_user",
      );
      if (currentRole.rows[0]?.rolsuper) {
        const testRole = await client.query(
          "SELECT 1 FROM pg_roles WHERE rolname = 'eper_action_rls_test'",
        );
        if (testRole.rows.length === 0) {
          await client.query("CREATE ROLE eper_action_rls_test NOLOGIN NOSUPERUSER NOBYPASSRLS");
        }
        await client.query("GRANT SELECT ON eper_action_proposals TO eper_action_rls_test");
        await client.query("BEGIN");
        await client.query("SELECT set_config('eper.tenant_id', $1, true)", ["different-tenant-" + suffix]);
        await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
        await client.query("SET LOCAL ROLE eper_action_rls_test");
        const hidden = await client.query(
          "SELECT proposal_id FROM eper_action_proposals WHERE tenant_id = $1 AND application_id = $2",
          [tenantId, applicationId],
        );
        assert.equal(hidden.rows.length, 0, "RLS must hide another tenant's proposal for a non-bypass role");
        await client.query("ROLLBACK");
      } else {
        const policy = await client.query(
          `SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'eper_action_proposals'
              AND policyname = 'tenant_application_isolation'`,
        );
        assert.equal(policy.rows.length, 1, "tenant/application RLS policy must be installed");
      }
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  });
