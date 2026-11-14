import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPostgresPaymentPool } from "../dist/packages/payments/postgres-payment-runtime.js";
import { PostgresWorkflowRoleDefinitionStore } from "../dist/packages/workflows/postgres-workflow-role-definition-store.js";
import { PostgresWorkflowActorRoleAssignmentStore } from "../dist/packages/workflows/postgres-workflow-actor-role-assignment-store.js";
import { WorkflowDefinitionPublisher } from "../dist/packages/workflows/workflow-definition-publisher.js";
import { PostgresWorkflowExecutionService } from "../dist/packages/workflows/postgres-workflow-execution-service.js";
import { ApplicationDataService } from "../dist/packages/application-data/service.js";
import { PostgresApplicationDataAdapter } from "../dist/packages/application-data/postgres-adapter.js";
import { ApplicationDataWorkflowActivity } from "../dist/packages/application-data/workflow-binding.js";
import { ApplicationDataActivityIntentWorker } from "../dist/packages/workflows/application-data-activity-intent-worker.js";
import { ApplicationDataIntentReconciler } from "../dist/packages/workflows/application-data-intent-reconciler.js";
import { PostgresApplicationDataModelAuthoringService } from "../dist/packages/application-data/model-authoring.js";

const databaseConfigured = Boolean(process.env.EPER_PAYMENT_DATABASE_URL || process.env.DATABASE_URL);

test("PostgreSQL workflow application-data activity writes once and advances once across worker and reconciler restarts",
  { skip: !databaseConfigured },
  async () => {
    const pool = createPostgresPaymentPool();
    const suffix = randomUUID().replace(/-/g, "");
    const tenantId = "data-wf-tenant-" + suffix;
    const applicationId = "data-wf-app-" + suffix;
    const actorId = "data-wf-actor-" + suffix;
    const correlationId = "data-wf-corr-" + suffix;
    const workflowId = "data-wf-" + suffix;
    const roleId = "data-wf-role";
    const environment = "uat";
    const entityType = "Order";
    const recordId = "order-" + suffix;
    const roleStore = new PostgresWorkflowRoleDefinitionStore(pool);
    const assignmentStore = new PostgresWorkflowActorRoleAssignmentStore(pool);
    const publisher = new WorkflowDefinitionPublisher(pool);
    const execution = new PostgresWorkflowExecutionService(pool, "application-data-workflow-integration");
    const modelService = new ApplicationDataService(new PostgresApplicationDataAdapter(pool));
    const activity = new ApplicationDataWorkflowActivity(
      new ApplicationDataService(new PostgresApplicationDataAdapter(pool, true)),
      async context => {
        if (!context.workflowRoleId || !context.workflowPermission) {
          throw new Error("APPLICATION_DATA_WORKFLOW_AUTHORIZATION_CONTEXT_MISSING");
        }
      },
    );

    try {
      await roleStore.assertReady();
      await assignmentStore.assertReady();
      await execution.assertReady();
      const setup = await pool.connect();
      try {
        await setup.query(
          `INSERT INTO eper_tenant_application_assignment
            (tenant_id, application_id, assignment_status, assigned_by, updated_by)
           VALUES ($1,$2,'active',$3,$3)`,
          [tenantId, applicationId, actorId],
        );
        await setup.query(
          `INSERT INTO eper_actor_application_assignment
            (tenant_id, actor_id, application_id, assignment_status, assigned_by, updated_by)
           VALUES ($1,$2,$3,'active',$2,$2)`,
          [tenantId, actorId, applicationId],
        );
      } finally { setup.release(); }

      await roleStore.replace({
        tenantId, applicationId, roleId, name: "Order operator",
        permissions: ["workflow:admin"], delegable: false, status: "active",
        expectedVersion: 0, changedBy: actorId, environment, correlationId,
      });
      await assignmentStore.assign({
        tenantId, applicationId, actorId, roleId, changedBy: actorId,
        expectedVersion: 0, environment, correlationId,
      });

      await modelService.registerModel({
        tenantId, applicationId, entityType, version: 1, status: "DRAFT",
        fields: [
          { id: "customerId", type: "string", required: true },
          { id: "total", type: "number", required: true },
        ],
      });
      await modelService.activateModel(tenantId, applicationId, entityType, 1);

      const definition = {
        id: workflowId, name: "Create customer order", status: "ACTIVE",
        activities: [{
          id: "create-order", title: "Create order", type: "TASK",
          roleId, permission: "workflow:act", nextActivityIds: ["read-order"],
          fields: [
            { id: "orderId", type: "text", required: true },
            { id: "orderData", type: "json", required: true },
          ],
          applicationDataBinding: {
            requirementId: "APP_DATA_WORKFLOW_ORDER_CREATE",
            entityType, operation: "create",
            recordIdField: "orderId", dataField: "orderData",
          },
        }, {
          id: "read-order", title: "Read persisted order", type: "TASK",
          roleId, permission: "workflow:act", nextActivityIds: ["query-orders"],
          fields: [{ id: "orderId", type: "text", required: true }],
          applicationDataBinding: {
            requirementId: "APP_DATA_WORKFLOW_ORDER_GET",
            entityType, operation: "get", recordIdField: "orderId",
          },
        }, {
          id: "query-orders", title: "Query customer orders", type: "TASK",
          roleId, permission: "workflow:act", nextActivityIds: ["confirm-order"],
          fields: [{ id: "limit", type: "number", required: true }],
          applicationDataBinding: {
            requirementId: "APP_DATA_WORKFLOW_ORDER_QUERY",
            entityType, operation: "query", resultKey: "orders",
          },
        }, {
          id: "confirm-order", title: "Confirm order", type: "TASK",
          roleId, permission: "workflow:act", nextActivityIds: [], fields: [],
        }],
      };
      await publisher.publish({ tenantId, applicationId, principalId: actorId, correlationId, environment }, definition);
      const started = await execution.start({
        tenantId, applicationId, actorId, correlationId, environment,
        workflowId, idempotencyKey: "start-" + suffix,
        businessReference: "ORDER-" + suffix,
        data: {
          orderId: recordId,
          orderData: { customerId: "customer-" + suffix, total: 42.5 },
        },
      });
      assert.equal(started.currentActivityId, "create-order");

      const waiting = await execution.transition({
        tenantId, applicationId, actorId, correlationId, environment,
        instanceId: started.instanceId, expectedVersion: started.version,
        idempotencyKey: "submit-" + suffix, action: "submit",
        payload: {
          orderId: recordId,
          orderData: { customerId: "customer-" + suffix, total: 42.5 },
        },
      });
      assert.equal(waiting.status, "waiting_for_data");
      assert.equal(waiting.currentActivityId, "create-order");

      const worker = new ApplicationDataActivityIntentWorker(pool, activity, {
        workerId: "data-wf-worker-" + suffix, maxAttempts: 3,
      });
      const executed = await worker.runOnce(tenantId, applicationId);
      assert.equal(executed.status, "succeeded");
      assert.equal(executed.result.result.id, recordId);
      const restartedWorker = new ApplicationDataActivityIntentWorker(pool, activity, {
        workerId: "data-wf-worker-restart-" + suffix, maxAttempts: 3,
      });
      assert.deepEqual(await restartedWorker.runOnce(tenantId, applicationId), { status: "idle" });

      const reconciler = new ApplicationDataIntentReconciler(pool, {
        workerId: "data-wf-reconcile-" + suffix, environment, maxAttempts: 3,
      });
      const advanced = await reconciler.runOnce(tenantId, applicationId);
      assert.equal(advanced.status, "advanced");
      if (advanced.status !== "advanced") throw new Error("APPLICATION_DATA_WORKFLOW_NOT_ADVANCED");
      assert.equal(advanced.instanceId, started.instanceId);
      assert.equal(advanced.resultingVersion, waiting.version + 1);

      const readWaiting = await execution.transition({
        tenantId, applicationId, actorId, correlationId, environment,
        instanceId: started.instanceId, expectedVersion: advanced.resultingVersion,
        idempotencyKey: "read-" + suffix, action: "submit",
        payload: { orderId: recordId },
      });
      assert.equal(readWaiting.status, "waiting_for_data");
      assert.equal(readWaiting.currentActivityId, "read-order");
      const readExecuted = await worker.runOnce(tenantId, applicationId);
      assert.equal(readExecuted.status, "succeeded");
      assert.equal(readExecuted.result.result.id, recordId);
      assert.deepEqual(readExecuted.result.result.data, { customerId: "customer-" + suffix, total: 42.5 });
      const readAdvanced = await reconciler.runOnce(tenantId, applicationId);
      assert.equal(readAdvanced.status, "advanced");
      if (readAdvanced.status !== "advanced") throw new Error("APPLICATION_DATA_WORKFLOW_READ_NOT_ADVANCED");
      assert.equal(readAdvanced.resultingVersion, readWaiting.version + 1);

      const queryWaiting = await execution.transition({
        tenantId, applicationId, actorId, correlationId, environment,
        instanceId: started.instanceId, expectedVersion: readAdvanced.resultingVersion,
        idempotencyKey: "query-" + suffix, action: "submit", payload: { limit: 10 },
      });
      assert.equal(queryWaiting.status, "waiting_for_data");
      assert.equal(queryWaiting.currentActivityId, "query-orders");
      const queryExecuted = await worker.runOnce(tenantId, applicationId);
      assert.equal(queryExecuted.status, "succeeded");
      assert.equal(queryExecuted.result.orders.length, 1);
      assert.equal(queryExecuted.result.orders[0].id, recordId);
      const queryAdvanced = await reconciler.runOnce(tenantId, applicationId);
      assert.equal(queryAdvanced.status, "advanced");
      if (queryAdvanced.status !== "advanced") throw new Error("APPLICATION_DATA_WORKFLOW_QUERY_NOT_ADVANCED");
      assert.equal(queryAdvanced.resultingVersion, queryWaiting.version + 1);

      const restartedReconciler = new ApplicationDataIntentReconciler(pool, {
        workerId: "data-wf-reconcile-restart-" + suffix, environment, maxAttempts: 3,
      });
      assert.deepEqual(await restartedReconciler.runOnce(tenantId, applicationId), { status: "idle" });

      const record = await modelService.get({
        tenantId, applicationId, actorId, correlationId, requirementId: "APP_DATA_WORKFLOW_VERIFY",
      }, entityType, recordId);
      assert.ok(record);
      assert.deepEqual(record.data, { customerId: "customer-" + suffix, total: 42.5 });

      const verify = await pool.connect();
      try {
        await verify.query("BEGIN");
        await verify.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
        await verify.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
        const instance = await verify.query(
          `SELECT status, version, current_activity_id, pending_activity_execution_id, data
             FROM eper_workflow_instances
            WHERE tenant_id=$1 AND application_id=$2 AND instance_id=$3`,
          [tenantId, applicationId, started.instanceId],
        );
        assert.equal(instance.rows.length, 1);
        assert.equal(instance.rows[0].status, "running");
        assert.equal(Number(instance.rows[0].version), queryWaiting.version + 1);
        assert.equal(instance.rows[0].current_activity_id, "confirm-order");
        assert.equal(instance.rows[0].pending_activity_execution_id, null);
        const workflowData = typeof instance.rows[0].data === "string"
          ? JSON.parse(instance.rows[0].data) : instance.rows[0].data;
        assert.equal(workflowData.orders.length, 1);
        assert.equal(workflowData.orders[0].id, recordId);
        assert.equal(workflowData.orders[0].data.total, 42.5);
        const intents = await verify.query(
          `SELECT intent_status, reconciliation_status
             FROM eper_workflow_application_data_intents
            WHERE tenant_id=$1 AND application_id=$2 AND instance_id=$3`,
          [tenantId, applicationId, started.instanceId],
        );
        assert.equal(intents.rows.length, 3);
        assert.ok(intents.rows.every(row =>
          row.intent_status === "advanced" && row.reconciliation_status === "completed"));
        const reconciliationTransitions = await verify.query(
          `SELECT count(*)::int AS count FROM eper_workflow_transitions
            WHERE tenant_id=$1 AND application_id=$2 AND instance_id=$3
              AND idempotency_key = $4`,
          [tenantId, applicationId, started.instanceId,
            "data-reconcile-" + (await verify.query(
              `SELECT activity_execution_id FROM eper_workflow_application_data_intents
                WHERE tenant_id=$1 AND application_id=$2 AND instance_id=$3`,
              [tenantId, applicationId, started.instanceId],
            )).rows[0].activity_execution_id],
        );
        assert.equal(reconciliationTransitions.rows[0].count, 1);
        const records = await verify.query(
          `SELECT count(*)::int AS count FROM eper_application_data_records
            WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND record_id=$4`,
          [tenantId, applicationId, entityType, recordId],
        );
        assert.equal(records.rows[0].count, 1);
        await verify.query("COMMIT");
      } catch (error) {
        try { await verify.query("ROLLBACK"); } catch { /* preserve assertion */ }
        throw error;
      } finally { verify.release(); }
    } finally {
      await pool.end();
    }
  });


test("PostgreSQL model authoring enforces versioning and atomically audits schema activation and retirement", { skip: !databaseConfigured }, async () => {
  const pool = createPostgresPaymentPool();
  const suffix = randomUUID().replace(/-/g, "");
  const tenantId = "model-author-tenant-" + suffix;
  const applicationId = "model-author-app-" + suffix;
  const actorId = "model-author-actor-" + suffix;
  const roleId = "model-author-role-" + suffix;
  const correlationId = "model-author-corr-" + suffix;
  const environment = "sandbox";
  const roleStore = new PostgresWorkflowRoleDefinitionStore(pool);
  const assignmentStore = new PostgresWorkflowActorRoleAssignmentStore(pool);
  const service = new PostgresApplicationDataModelAuthoringService(pool);
  const context = {
    tenantId, applicationId, actorId, roleId, correlationId,
    requirementId: "REQ-46301", environment,
  };
  try {
    await roleStore.assertReady();
    await assignmentStore.assertReady();
    const setup = await pool.connect();
    try {
      await setup.query(
        `INSERT INTO eper_tenant_application_assignment
          (tenant_id, application_id, assignment_status, assigned_by, updated_by)
         VALUES ($1,$2,'active',$3,$3)`,
        [tenantId, applicationId, actorId],
      );
      await setup.query(
        `INSERT INTO eper_actor_application_assignment
          (tenant_id, actor_id, application_id, assignment_status, assigned_by, updated_by)
         VALUES ($1,$2,$3,'active',$2,$2)`,
        [tenantId, actorId, applicationId],
      );
    } finally { setup.release(); }
    await roleStore.replace({
      tenantId, applicationId, roleId, name: "Application model administrator",
      permissions: ["workflow:admin"], delegable: false, status: "active",
      expectedVersion: 0, changedBy: actorId, environment, correlationId,
    });
    await assignmentStore.assign({
      tenantId, applicationId, actorId, roleId, changedBy: actorId,
      expectedVersion: 0, environment, correlationId,
    });

    const first = await service.createDraft(context, {
      entityType: "Order", expectedVersion: 0,
      fields: [{ id: "total", type: "number", required: true }],
    });
    assert.equal(first.version, 1);
    await service.activate(context, "Order", 1);
    const second = await service.createDraft(context, {
      entityType: "Order", expectedVersion: 1,
      fields: [
        { id: "total", type: "number", required: true },
        { id: "fulfillmentMode", type: "string" },
      ],
    });
    assert.equal(second.version, 2);
    await assert.rejects(
      () => service.createDraft(context, {
        entityType: "Order", expectedVersion: 1,
        fields: [{ id: "total", type: "number" }],
      }),
      /APPLICATION_DATA_SCHEMA_VERSION_CONFLICT/,
    );
    await service.activate(context, "Order", 2);
    await service.retire(context, "Order", 2);

    const models = await pool.query(
      `SELECT version, status FROM eper_application_data_models
        WHERE tenant_id=$1 AND application_id=$2 AND entity_type='Order'
        ORDER BY version`,
      [tenantId, applicationId],
    );
    assert.deepEqual(models.rows.map(row => [row.version, row.status]), [
      [1, "RETIRED"], [2, "RETIRED"],
    ]);
    const audit = await pool.query(
      `SELECT action FROM eper_audit_events
        WHERE tenant_id=$1 AND application_id=$2 AND correlation_id=$3
        ORDER BY occurred_at, event_id`,
      [tenantId, applicationId, correlationId],
    );
    assert.deepEqual(audit.rows.map(row => row.action).sort(), [
      "APPLICATION_DATA_MODEL_ACTIVATED",
      "APPLICATION_DATA_MODEL_DRAFT_CREATED",
      "APPLICATION_DATA_MODEL_DRAFT_CREATED",
      "APPLICATION_DATA_MODEL_RETIRED",
      "APPLICATION_DATA_MODEL_RETIRED",
    ].sort());
    const outbox = await pool.query(
      `SELECT event_type FROM transactional_outbox
        WHERE tenant_id=$1 AND correlation_id=$2`,
      [tenantId, correlationId],
    );
    assert.equal(outbox.rows.length, 5);
  } finally {
    await pool.end();
  }
});
