import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPostgresPaymentPool } from "../dist/packages/payments/postgres-payment-runtime.js";
import { PostgresWorkflowRoleDefinitionStore } from "../dist/packages/workflows/postgres-workflow-role-definition-store.js";
import { PostgresWorkflowActorRoleAssignmentStore } from "../dist/packages/workflows/postgres-workflow-actor-role-assignment-store.js";
import { PostgresWorkflowRoleDelegationStore } from "../dist/packages/workflows/postgres-workflow-role-delegation-store.js";

const databaseConfigured = Boolean(process.env.EPER_PAYMENT_DATABASE_URL || process.env.DATABASE_URL);

test("PostgreSQL role delegation persists grant/revoke provenance, enforces scope and versions, and audits atomically",
  { skip: !databaseConfigured },
  async () => {
    const pool = createPostgresPaymentPool();
    const suffix = randomUUID();
    const tenantId = "delegation-tenant-" + suffix;
    const applicationId = "delegation-app-" + suffix;
    const grantorId = "delegation-admin-" + suffix;
    const targetId = "delegation-user-" + suffix;
    const otherTenantId = "delegation-other-tenant-" + suffix;
    const otherApplicationId = "delegation-other-app-" + suffix;
    const otherActorId = "delegation-other-user-" + suffix;
    const adminRoleId = "customer-admin";
    const memberRoleId = "workflow-reader";
    const correlationId = "delegation-correlation-" + suffix;
    const environment = "sandbox";
    const roleDefinitions = new PostgresWorkflowRoleDefinitionStore(pool);
    const assignments = new PostgresWorkflowActorRoleAssignmentStore(pool);
    const delegations = new PostgresWorkflowRoleDelegationStore(pool);

    try {
      await roleDefinitions.assertReady();
      await assignments.assertReady();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
        await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
        await client.query(
          `INSERT INTO eper_tenant_application_assignment
            (tenant_id, application_id, assignment_status, assigned_by, updated_by)
           VALUES ($1,$2,'active',$3,$3)`,
          [tenantId, applicationId, grantorId],
        );
        await client.query(
          `INSERT INTO eper_actor_application_assignment
            (tenant_id, actor_id, application_id, assignment_status, assigned_by, updated_by)
           VALUES ($1,$2,$3,'active',$2,$2), ($1,$4,$3,'active',$4,$4)`,
          [tenantId, grantorId, applicationId, targetId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }

      await roleDefinitions.replace({
        tenantId, applicationId, roleId: adminRoleId, name: "Customer Admin",
        permissions: ["access:manage", "role:assign", "workflow:view"],
        delegable: false, status: "active", expectedVersion: 0,
        changedBy: grantorId, environment, correlationId,
      });
      await roleDefinitions.replace({
        tenantId, applicationId, roleId: memberRoleId, name: "Workflow Reader",
        permissions: ["workflow:view"], delegable: true, status: "active",
        expectedVersion: 0, changedBy: grantorId, environment, correlationId,
      });
      await roleDefinitions.replace({
        tenantId, applicationId, roleId: "restricted-reader", name: "Restricted Reader",
        permissions: ["workflow:view"], delegable: false, status: "active",
        expectedVersion: 0, changedBy: grantorId, environment, correlationId,
      });
      await assignments.assign({
        tenantId, applicationId, actorId: grantorId, roleId: adminRoleId,
        changedBy: grantorId, expectedVersion: 0, environment, correlationId,
      });

      const nonDelegableInput = {
        tenantId, applicationId, grantorActorId: grantorId, grantorRoleId: adminRoleId,
        targetActorId: targetId, targetRoleId: "restricted-reader", expectedVersion: 0,
        environment, correlationId,
      };
      await assert.rejects(
        delegations.grant(nonDelegableInput),
        /WORKFLOW_ROLE_DELEGATION_TARGET_ROLE_NOT_DELEGABLE/,
      );
      const nonDelegableAssignment = await assignments.listAssignments(tenantId, applicationId);
      assert.equal(nonDelegableAssignment.some(row => row.actorId === targetId && row.roleId === "restricted-reader"), false);

      const input = {
        tenantId, applicationId, grantorActorId: grantorId, grantorRoleId: adminRoleId,
        targetActorId: targetId, targetRoleId: memberRoleId, expectedVersion: 0,
        environment, correlationId,
      };
      const granted = await delegations.grant(input);
      assert.equal(granted.actorId, targetId);
      assert.equal(granted.roleId, memberRoleId);
      assert.equal(granted.status, "active");
      assert.equal(granted.version, 1);
      assert.equal(granted.grantorActorId, grantorId);

      await assert.rejects(
        delegations.grant({ ...input, applicationId: otherApplicationId, expectedVersion: 0 }),
        /WORKFLOW_ROLE_DELEGATION_TENANT_APPLICATION_NOT_ACTIVE|WORKFLOW_ROLE_DELEGATION_TARGET_ROLE_NOT_ACTIVE/,
      );
      await assert.rejects(
        delegations.grant({ ...input, tenantId: otherTenantId, applicationId: otherApplicationId, expectedVersion: 0 }),
        /WORKFLOW_ROLE_DELEGATION_TENANT_APPLICATION_NOT_ACTIVE/,
      );
      await assert.rejects(
        delegations.grant({ ...input, expectedVersion: 0 }),
        /WORKFLOW_ROLE_DELEGATION_VERSION_CONFLICT:1/,
      );

      const revoked = await delegations.revoke({ ...input, expectedVersion: 1 });
      assert.equal(revoked.status, "revoked");
      assert.equal(revoked.version, 2);
      assert.equal(revoked.revokedBy, grantorId);
      await assert.rejects(
        delegations.revoke({ ...input, expectedVersion: 1 }),
        /WORKFLOW_ROLE_DELEGATION_ASSIGNMENT_NOT_FOUND|WORKFLOW_ROLE_DELEGATION_VERSION_CONFLICT:2/,
      );

      const verify = await pool.connect();
      try {
        await verify.query("BEGIN");
        await verify.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
        await verify.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
        const assignment = await verify.query(
          `SELECT assignment_status, version, assigned_by, grantor_actor_id, revoked_by
             FROM eper_workflow_actor_role_assignment
            WHERE tenant_id=$1 AND application_id=$2 AND actor_id=$3 AND role_id=$4`,
          [tenantId, applicationId, targetId, memberRoleId],
        );
        assert.equal(assignment.rows.length, 1);
        assert.equal(assignment.rows[0].assignment_status, "revoked");
        assert.equal(Number(assignment.rows[0].version), 2);
        assert.equal(assignment.rows[0].assigned_by, grantorId);
        assert.equal(assignment.rows[0].grantor_actor_id, grantorId);
        assert.equal(assignment.rows[0].revoked_by, grantorId);

        const audit = await verify.query(
          `SELECT action, outcome, actor_id, resource_id
             FROM eper_audit_events
            WHERE tenant_id=$1 AND application_id=$2
              AND resource_type='workflow-actor-role-assignment' AND resource_id=$3
              AND action IN ('workflow.role_assignment.delegate','workflow.role_assignment.revoke')
            ORDER BY occurred_at`,
          [tenantId, applicationId, targetId],
        );
        assert.deepEqual(audit.rows.map(row => row.action), [
          "workflow.role_assignment.delegate", "workflow.role_assignment.revoke",
        ]);
        assert.ok(audit.rows.every(row => row.outcome === "success" && row.actor_id === grantorId));
        await verify.query("COMMIT");
      } catch (error) {
        try { await verify.query("ROLLBACK"); } catch { /* preserve original failure */ }
        throw error;
      } finally { verify.release(); }
    } finally {
      await pool.end();
    }
  });


test("PostgreSQL serializes concurrent Customer Admin revocations and preserves the last administrator",
  { skip: !databaseConfigured },
  async () => {
    const pool = createPostgresPaymentPool();
    const suffix = randomUUID();
    const tenantId = "last-admin-tenant-" + suffix;
    const applicationId = "last-admin-app-" + suffix;
    const actorA = "last-admin-a-" + suffix;
    const actorB = "last-admin-b-" + suffix;
    const roleId = "customer-admin";
    const correlationId = "last-admin-correlation-" + suffix;
    const environment = "sandbox";
    const roleDefinitions = new PostgresWorkflowRoleDefinitionStore(pool);
    const assignments = new PostgresWorkflowActorRoleAssignmentStore(pool);
    const delegations = new PostgresWorkflowRoleDelegationStore(pool);
    try {
      await roleDefinitions.assertReady();
      await assignments.assertReady();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
        await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
        await client.query(
          `INSERT INTO eper_tenant_application_assignment
            (tenant_id, application_id, assignment_status, assigned_by, updated_by)
           VALUES ($1,$2,'active',$3,$3)`,
          [tenantId, applicationId, actorA],
        );
        await client.query(
          `INSERT INTO eper_actor_application_assignment
            (tenant_id, actor_id, application_id, assignment_status, assigned_by, updated_by)
           VALUES ($1,$2,$3,'active',$2,$2), ($1,$4,$3,'active',$4,$4)`,
          [tenantId, actorA, applicationId, actorB],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }

      await roleDefinitions.replace({
        tenantId, applicationId, roleId, name: "Customer Admin",
        permissions: ["access:manage", "role:assign", "workflow:view"],
        delegable: false, status: "active", expectedVersion: 0,
        changedBy: actorA, environment, correlationId,
      });
      await assignments.assign({
        tenantId, applicationId, actorId: actorA, roleId,
        changedBy: actorA, expectedVersion: 0, environment, correlationId,
      });
      await assignments.assign({
        tenantId, applicationId, actorId: actorB, roleId,
        changedBy: actorA, expectedVersion: 0, environment, correlationId,
      });

      const base = { tenantId, applicationId, targetRoleId: roleId, expectedVersion: 1,
        environment, correlationId };
      const outcomes = await Promise.allSettled([
        delegations.revoke({ ...base, grantorActorId: actorA, grantorRoleId: roleId, targetActorId: actorB }),
        delegations.revoke({ ...base, grantorActorId: actorB, grantorRoleId: roleId, targetActorId: actorA }),
      ]);
      assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(outcomes.filter(result => result.status === "rejected").length, 1);
      const rejected = outcomes.find(result => result.status === "rejected");
      // Depending on lock order, the losing transaction either observes the last-admin guard
      // or finds that its grantor role was already revoked by the winning transaction.
      assert.match(String(rejected.reason?.message),
        /WORKFLOW_ROLE_DELEGATION_LAST_CUSTOMER_ADMIN_PROTECTED|WORKFLOW_ROLE_DELEGATION_GRANTOR_NOT_AUTHORIZED/);

      const remaining = await assignments.listAssignments(tenantId, applicationId);
      assert.equal(remaining.filter(assignment => assignment.status === "active" && assignment.roleId === roleId).length, 1);
    } finally {
      await pool.end();
    }
  });
