import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPostgresPaymentPool } from "../dist/packages/payments/postgres-payment-runtime.js";
import { PostgresWorkflowRoleDefinitionStore } from "../dist/packages/workflows/postgres-workflow-role-definition-store.js";
import { PostgresWorkflowActorRoleAssignmentStore } from "../dist/packages/workflows/postgres-workflow-actor-role-assignment-store.js";
import { WorkflowDefinitionPublisher } from "../dist/packages/workflows/workflow-definition-publisher.js";
import { PostgresWorkflowExecutionService } from "../dist/packages/workflows/postgres-workflow-execution-service.js";

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
      await assignmentStore.assign({
        tenantId, applicationId, actorId, roleId, changedBy: actorId,
        expectedVersion: 0, environment, correlationId,
      });

      const definition = {
        id: workflowId, name: "Expense submission", status: "ACTIVE",
        activities: [{
          id: "submit-expense", title: "Submit expense", type: "TASK",
          roleId, permission: "workflow:act", nextActivityIds: [], fields: [],
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
      const started = await service.start(startInput);
      assert.equal(started.status, "running");
      assert.equal(started.version, 1);
      assert.equal(started.currentActivityId, "submit-expense");

      const transitionInput = {
        tenantId, applicationId, actorId, correlationId, environment,
        instanceId: started.instanceId, expectedVersion: 1,
        idempotencyKey: "transition-" + suffix, action: "submit", payload: {},
      };
      const completed = await service.transition(transitionInput);
      assert.equal(completed.status, "completed");
      assert.equal(completed.version, 2);
      assert.equal(completed.currentActivityId, null);

      // A new service object simulates process recreation; the database is the authority.
      const restartedService = new PostgresWorkflowExecutionService(pool, "workflow-integration-test-restarted");
      const startReplay = await restartedService.start(startInput);
      assert.equal(startReplay.instanceId, started.instanceId);
      assert.equal(startReplay.version, 1);
      const transitionReplay = await restartedService.transition(transitionInput);
      assert.equal(transitionReplay.status, "completed");
      assert.equal(transitionReplay.version, 2);

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
        assert.equal(Number(instances.rows[0].version), 2);
        assert.equal(Number(instances.rows[0].definition_version), 1);
        assert.equal(String(instances.rows[0].definition_digest).trim(), published.definitionDigest);

        const transitions = await verify.query(
          `SELECT action FROM eper_workflow_transitions
            WHERE tenant_id = $1 AND application_id = $2 AND instance_id = $3
            ORDER BY resulting_version`,
          [tenantId, applicationId, started.instanceId],
        );
        assert.deepEqual(transitions.rows.map(row => row.action), ["start", "submit"]);

        const audit = await verify.query(
          `SELECT action FROM eper_audit_events
            WHERE tenant_id = $1 AND application_id = $2
              AND resource_type = 'workflow-instance' AND resource_id = $3
            ORDER BY occurred_at, event_id`,
          [tenantId, applicationId, started.instanceId],
        );
        assert.deepEqual(audit.rows.map(row => row.action), [
          "workflow.instance.start", "workflow.instance.transition",
        ]);
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
