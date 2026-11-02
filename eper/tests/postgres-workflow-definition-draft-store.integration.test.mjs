import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPostgresPaymentPool } from "../dist/packages/payments/postgres-payment-runtime.js";
import { PostgresWorkflowDefinitionDraftStore } from "../dist/packages/workflows/postgres-workflow-definition-draft-store.js";
import { WorkflowDefinitionPublisher } from "../dist/packages/workflows/workflow-definition-publisher.js";

const databaseConfigured = Boolean(process.env.EPER_PAYMENT_DATABASE_URL || process.env.DATABASE_URL);

test("PostgreSQL workflow drafts enforce tenant/application RLS, optimistic concurrency and atomic audit",
  { skip: !databaseConfigured },
  async () => {
    const pool = createPostgresPaymentPool();
    const suffix = randomUUID();
    const tenantId = "wf-draft-tenant-" + suffix;
    const applicationId = "wf-draft-app-" + suffix;
    const actorId = "wf-draft-actor-" + suffix;
    const workflowId = "wf-draft-" + suffix;
    const correlationId = "wf-draft-correlation-" + suffix;
    const store = new PostgresWorkflowDefinitionDraftStore(pool);
    const environment = "sandbox";

    const definition = (name) => ({
      id: workflowId,
      name,
      status: "DRAFT",
      activities: [{
        id: "submit",
        title: "Submit request",
        type: "TASK",
        roleId: "requester",
        permission: "workflow:act",
        nextActivityIds: [],
        fields: [],
      }],
    });

    try {
      await store.assertReady();
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

      const created = await store.replace({
        tenantId, applicationId, workflowId, definition: definition("Expense request"),
        expectedVersion: 0, changeReason: "Initial design", changedBy: actorId,
        environment, correlationId, serviceVersion: "workflow-draft-integration-test",
      });
      assert.equal(created.draftVersion, 1);
      assert.equal(created.createdBy, actorId);
      assert.equal(created.updatedBy, actorId);

      const reloadedStore = new PostgresWorkflowDefinitionDraftStore(pool);
      const reloaded = await reloadedStore.get(tenantId, applicationId, workflowId);
      assert.equal(reloaded?.draftVersion, 1);
      assert.equal(reloaded?.definition.name, "Expense request");
      assert.equal((await reloadedStore.list(tenantId, applicationId)).length, 1);

      const concurrent = await Promise.allSettled([
        store.replace({
          tenantId, applicationId, workflowId, definition: definition("Expense request — revision A"),
          expectedVersion: 1, changeReason: "Concurrent edit A", changedBy: actorId,
          environment, correlationId: correlationId + "-a",
        }),
        store.replace({
          tenantId, applicationId, workflowId, definition: definition("Expense request — revision B"),
          expectedVersion: 1, changeReason: "Concurrent edit B", changedBy: actorId,
          environment, correlationId: correlationId + "-b",
        }),
      ]);
      assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(concurrent.filter(result => result.status === "rejected").length, 1);
      const conflict = concurrent.find(result => result.status === "rejected");
      assert.match(conflict.reason.message, /^WORKFLOW_DRAFT_VERSION_CONFLICT:2$/);

      const current = await reloadedStore.get(tenantId, applicationId, workflowId);
      assert.equal(current?.draftVersion, 2);
      assert.ok([
        "Expense request — revision A",
        "Expense request — revision B",
      ].includes(current?.definition.name));

      assert.deepEqual(await reloadedStore.list("wf-draft-unassigned-tenant-" + suffix, applicationId), []);
      assert.equal(await reloadedStore.get(tenantId, "wf-draft-unassigned-app-" + suffix, workflowId), null);

      await assert.rejects(
        store.replace({
          tenantId, applicationId, workflowId, definition: definition("Unauthorized edit"),
          expectedVersion: 2, changeReason: "Unassigned actor", changedBy: "wf-draft-unassigned-" + suffix,
          environment, correlationId: correlationId + "-unassigned",
        }),
        /WORKFLOW_DRAFT_ACTOR_APPLICATION_NOT_ACTIVE/,
      );

      const verify = await pool.connect();
      try {
        await verify.query("BEGIN");
        await verify.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
        await verify.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
        const audit = await verify.query(
          `SELECT COUNT(*)::int AS count
             FROM eper_audit_events
            WHERE tenant_id = $1 AND application_id = $2
              AND action = 'workflow.definition_draft.replace'`,
          [tenantId, applicationId],
        );
        assert.equal(audit.rows[0].count, 2, "only the create and one winning concurrent update are audited");
        await verify.query("COMMIT");
      } catch (error) {
        await verify.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally { verify.release(); }
    } finally {
      const cleanup = await pool.connect();
      try {
        await cleanup.query("BEGIN");
        await cleanup.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
        await cleanup.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
        await cleanup.query(
          "DELETE FROM eper_workflow_definition_drafts WHERE tenant_id=$1 AND application_id=$2 AND workflow_id=$3",
          [tenantId, applicationId, workflowId],
        );
        await cleanup.query(
          "DELETE FROM eper_audit_events WHERE tenant_id=$1 AND application_id=$2",
          [tenantId, applicationId],
        );
        await cleanup.query(
          "DELETE FROM eper_actor_application_assignment WHERE tenant_id=$1 AND actor_id=$2 AND application_id=$3",
          [tenantId, actorId, applicationId],
        );
        await cleanup.query(
          "DELETE FROM eper_tenant_application_assignment WHERE tenant_id=$1 AND application_id=$2",
          [tenantId, applicationId],
        );
        await cleanup.query("COMMIT");
      } catch {
        await cleanup.query("ROLLBACK").catch(() => undefined);
      } finally {
        cleanup.release();
        await pool.end();
      }
    }
  });


test("PostgreSQL workflow save-versus-publish race never publishes a stale or unintended draft revision",
  { skip: !databaseConfigured },
  async () => {
    const pool = createPostgresPaymentPool();
    const suffix = randomUUID();
    const tenantId = "wf-race-tenant-" + suffix;
    const applicationId = "wf-race-app-" + suffix;
    const actorId = "wf-race-actor-" + suffix;
    const workflowId = "wf-race-" + suffix;
    const correlationId = "wf-race-correlation-" + suffix;
    const environment = "sandbox";
    const store = new PostgresWorkflowDefinitionDraftStore(pool);
    const publisher = new WorkflowDefinitionPublisher(pool);
    const draft = (name) => ({
      id: workflowId, name, status: "DRAFT",
      activities: [{
        id: "submit", title: "Submit request", type: "TASK",
        roleId: "requester", permission: "workflow:act",
        nextActivityIds: [], fields: [],
      }],
    });
    const context = {
      tenantId, applicationId, principalId: actorId,
      correlationId, environment,
    };

    try {
      await store.assertReady();
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
        await setup.query(
          `INSERT INTO eper_workflow_role_definition
            (tenant_id, application_id, role_id, name, permissions, role_status, created_by, updated_by)
           VALUES ($1,$2,'requester','Requester','["workflow:act"]'::jsonb,'active',$3,$3)`,
          [tenantId, applicationId, actorId],
        );
      } finally { setup.release(); }

      const initial = await store.replace({
        tenantId, applicationId, workflowId, definition: draft("Original workflow"),
        expectedVersion: 0, changedBy: actorId, environment, correlationId,
      });
      assert.equal(initial.draftVersion, 1);

      const editedDraft = draft("Concurrent edited workflow");
      const publishSnapshot = { ...draft("Original workflow"), status: "ACTIVE" };
      const [saveResult, publishResult] = await Promise.allSettled([
        store.replace({
          tenantId, applicationId, workflowId, definition: editedDraft,
          expectedVersion: 1, changedBy: actorId, environment,
          correlationId: correlationId + "-save",
        }),
        publisher.publish(
          { ...context, correlationId: correlationId + "-publish" },
          publishSnapshot,
          { expectedDraftVersion: 1 },
        ),
      ]);

      const current = await store.get(tenantId, applicationId, workflowId);
      assert.ok(current, "the durable draft must remain available");
      if (publishResult.status === "fulfilled") {
        // Publish acquired the workflow lock first: exactly revision 1 is published.
        assert.equal(publishResult.value.definitionVersion, 1);
        assert.equal(publishResult.value.definition.name, "Original workflow");
        assert.equal(current.draftVersion, 2);
        assert.equal(current.definition.name, "Concurrent edited workflow");
        assert.equal(saveResult.status, "fulfilled");
      } else {
        // Save acquired the workflow lock first: publishing the stale revision must conflict.
        assert.equal(publishResult.reason.code, "WORKFLOW_PUBLISH_DRAFT_VERSION_CONFLICT");
        assert.equal(saveResult.status, "fulfilled");
        assert.equal(current.draftVersion, 2);
        assert.equal(current.definition.name, "Concurrent edited workflow");
      }

      const verify = await pool.connect();
      try {
        await verify.query("BEGIN");
        await verify.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
        await verify.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
        const versions = await verify.query(
          `SELECT definition_version, definition
             FROM eper_workflow_definition_versions
            WHERE tenant_id = $1 AND application_id = $2 AND workflow_id = $3
            ORDER BY definition_version`,
          [tenantId, applicationId, workflowId],
        );
        if (publishResult.status === "fulfilled") {
          assert.equal(versions.rows.length, 1);
          assert.equal(versions.rows[0].definition.name, "Original workflow");
        } else {
          assert.equal(versions.rows.length, 0, "a stale publish must not create a publication");
        }
        await verify.query("COMMIT");
      } catch (error) {
        await verify.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally { verify.release(); }
    } finally {
      // Keep immutable publication/audit evidence in the isolated CI database;
      // the per-test tenant and workflow IDs are unique and never reused.
      await pool.end();
    }
  });
