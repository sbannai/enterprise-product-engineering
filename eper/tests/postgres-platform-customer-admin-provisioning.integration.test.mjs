import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createPostgresPaymentPool } from "../dist/packages/payments/postgres-payment-runtime.js";
import { PostgresWorkflowRoleDefinitionStore } from "../dist/packages/workflows/postgres-workflow-role-definition-store.js";
import { PostgresWorkflowActorRoleAssignmentStore } from "../dist/packages/workflows/postgres-workflow-actor-role-assignment-store.js";
import { PostgresPlatformCustomerAdminProvisioningStore } from "../dist/packages/workflows/postgres-platform-customer-admin-provisioning-store.js";
import { PostgresCustomerIdentitySessionStore } from "../dist/packages/identity/postgres-customer-identity-session-store.js";

const databaseConfigured = Boolean(process.env.EPER_PAYMENT_DATABASE_URL || process.env.DATABASE_URL);

test("PostgreSQL platform admin provisions first Customer Admin and recovers only after lockout with idempotent audit-backed writes",
  { skip: !databaseConfigured },
  async () => {
    const pool = createPostgresPaymentPool();
    const suffix = randomUUID();
    const tenantId = "platform-provision-tenant-" + suffix;
    const applicationId = "platform-provision-app-" + suffix;
    const platformActorId = "platform-operator-" + suffix;
    const firstAdminId = "platform-first-admin-" + suffix;
    const recoveredAdminId = "platform-recovered-admin-" + suffix;
    const roleId = "customer-admin";
    const correlationId = "platform-provision-correlation-" + suffix;
    const environment = "sandbox";
    const principal = {
      platformActorId,
      permissions: ["customer_admin:provision", "customer_admin:recover"],
      credentialId: "platform-key-rotation-" + suffix,
    };
    const roleDefinitions = new PostgresWorkflowRoleDefinitionStore(pool);
    const assignments = new PostgresWorkflowActorRoleAssignmentStore(pool);
    const provisioning = new PostgresPlatformCustomerAdminProvisioningStore(pool);
    const identitySessions = new PostgresCustomerIdentitySessionStore(pool);
    let firstAdminSessionHash;

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
          [tenantId, applicationId, platformActorId],
        );
        await client.query(
          `INSERT INTO eper_actor_application_assignment
            (tenant_id, actor_id, application_id, assignment_status, assigned_by, updated_by)
           VALUES ($1,$2,$3,'active',$2,$2), ($1,$4,$3,'active',$4,$4)`,
          [tenantId, firstAdminId, applicationId, recoveredAdminId],
        );
        await client.query("COMMIT");
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
        throw error;
      } finally { client.release(); }

      await roleDefinitions.replace({
        tenantId, applicationId, roleId, name: "Customer Admin",
        permissions: ["access:manage", "role:assign", "workflow:view"],
        delegable: false, status: "active", expectedVersion: 0,
        changedBy: platformActorId, environment, correlationId,
      });

      await identitySessions.bindSubject({
        issuer: "https://identity.example.test",
        subject: "platform-subject-" + suffix,
        tenantId, actorId: firstAdminId, provisionedBy: platformActorId, correlationId,
      });
      const browserSession = await identitySessions.createSession({
        issuer: "https://identity.example.test",
        subject: "platform-subject-" + suffix,
        tenantId, actorId: firstAdminId,
        idleExpiresAt: new Date(Date.now() + 15 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
        correlationId,
      });
      firstAdminSessionHash = createHash("sha256").update(browserSession.sessionToken, "utf8").digest("hex");
      // Inject an audit failure and verify the enclosing mutation rolls back.
      const failureCorrelationId = "audit-failure-" + suffix;
      const auditFailureTrigger = "eper_pfa_" + suffix.replaceAll("-", "");
      const auditFailureFunction = "eper_pfafn_" + suffix.replaceAll("-", "");
      const triggerClient = await pool.connect();
      try {
        const functionSql = "CREATE FUNCTION public." + auditFailureFunction +
          "() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN IF NEW.tenant_id = ''" + tenantId +
          "'' THEN RAISE EXCEPTION ''injected platform audit failure''; END IF; RETURN NEW; END;'";
        await triggerClient.query(functionSql);
        await triggerClient.query("CREATE TRIGGER " + auditFailureTrigger +
          " BEFORE INSERT ON eper_audit_events FOR EACH ROW EXECUTE FUNCTION public." + auditFailureFunction + "()");
      } finally { triggerClient.release(); }
      await assert.rejects(provisioning.mutate({
        principal, operation: "provision", tenantId, applicationId,
        targetActorId: recoveredAdminId, idempotencyKey: "audit-failure-" + suffix,
        correlationId: failureCorrelationId, environment,
      }), /injected platform audit failure/);
      const rollbackVerify = await pool.connect();
      try {
        await rollbackVerify.query("BEGIN");
        await rollbackVerify.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
        await rollbackVerify.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
        const noAssignment = await rollbackVerify.query("SELECT 1 FROM eper_workflow_actor_role_assignment WHERE tenant_id=$1 AND application_id=$2 AND actor_id=$3 AND role_id=$4", [tenantId, applicationId, recoveredAdminId, roleId]);
        const noLedger = await rollbackVerify.query("SELECT 1 FROM eper_platform_admin_operation_idempotency WHERE tenant_id=$1 AND application_id=$2 AND idempotency_key=$3", [tenantId, applicationId, "audit-failure-" + suffix]);
        assert.equal(noAssignment.rows.length, 0);
        assert.equal(noLedger.rows.length, 0);
        await rollbackVerify.query("COMMIT");
      } catch (error) { try { await rollbackVerify.query("ROLLBACK"); } catch {} throw error; }
      finally { rollbackVerify.release(); }
      const cleanupTrigger = await pool.connect();
      try {
        await cleanupTrigger.query("DROP TRIGGER IF EXISTS " + auditFailureTrigger + " ON eper_audit_events");
        await cleanupTrigger.query("DROP FUNCTION IF EXISTS public." + auditFailureFunction + "()");
      } finally { cleanupTrigger.release(); }
      const first = await provisioning.mutate({
        principal, operation: "provision", tenantId, applicationId,
        targetActorId: firstAdminId, idempotencyKey: "first-" + suffix,
        correlationId, environment,
      });
      assert.equal(first.status, "active");
      assert.equal(first.version, 1);
      assert.equal(first.actorId, firstAdminId);
      assert.equal(first.replayed, false);

      const replay = await provisioning.mutate({
        principal, operation: "provision", tenantId, applicationId,
        targetActorId: firstAdminId, idempotencyKey: "first-" + suffix,
        correlationId, environment,
      });
      assert.equal(replay.replayed, true);
      assert.equal(replay.version, first.version);

      await assert.rejects(
        provisioning.mutate({
          principal, operation: "provision", tenantId, applicationId,
          targetActorId: recoveredAdminId, idempotencyKey: "first-" + suffix,
          correlationId, environment,
        }),
        /PLATFORM_CUSTOMER_ADMIN_IDEMPOTENCY_KEY_REUSED/,
      );

      await assert.rejects(
        provisioning.mutate({
          principal: { ...principal, permissions: ["customer_admin:provision"] },
          operation: "recover", tenantId, applicationId,
          targetActorId: recoveredAdminId, idempotencyKey: "recover-no-permission-" + suffix,
          correlationId, environment, reasonTicketReference: "INC-" + suffix,
        }),
        /PLATFORM_CUSTOMER_ADMIN_PERMISSION_DENIED/,
      );

      await assignments.revoke({
        tenantId, applicationId, actorId: firstAdminId, roleId,
        changedBy: platformActorId, expectedVersion: 1, environment, correlationId,
      });

      await assert.rejects(
        provisioning.mutate({
          principal, operation: "recover", tenantId, applicationId,
          targetActorId: recoveredAdminId, idempotencyKey: "recover-no-reason-" + suffix,
          correlationId, environment,
        }),
        /PLATFORM_CUSTOMER_ADMIN_RECOVERY_REASON_REQUIRED/,
      );

      const recovered = await provisioning.mutate({
        principal, operation: "recover", tenantId, applicationId,
        targetActorId: recoveredAdminId, idempotencyKey: "recover-" + suffix,
        correlationId, environment, reasonTicketReference: "INC-" + suffix,
      });
      assert.equal(recovered.status, "active");
      assert.equal(recovered.actorId, recoveredAdminId);
      assert.equal(recovered.version, 1);
      assert.equal(recovered.operation, "recover");

      // Competing recovery attempts serialize on the tenant/application lock.
      await assignments.revoke({
        tenantId, applicationId, actorId: recoveredAdminId, roleId,
        changedBy: platformActorId, expectedVersion: 1, environment, correlationId,
      });
      const concurrent = await Promise.allSettled([
        provisioning.mutate({ principal, operation: "recover", tenantId, applicationId,
          targetActorId: firstAdminId, idempotencyKey: "concurrent-recover-a-" + suffix,
          correlationId, environment, reasonTicketReference: "INC-CONCURRENT-A-" + suffix }),
        provisioning.mutate({ principal, operation: "recover", tenantId, applicationId,
          targetActorId: recoveredAdminId, idempotencyKey: "concurrent-recover-b-" + suffix,
          correlationId, environment, reasonTicketReference: "INC-CONCURRENT-B-" + suffix }),
      ]);
      assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(concurrent.filter(result => result.status === "rejected").length, 1);
      const rejected = concurrent.find(result => result.status === "rejected");
      assert.match(String(rejected.reason?.message), /PLATFORM_CUSTOMER_ADMIN_ALREADY_ACTIVE/);
      const verify = await pool.connect();
      try {
        await verify.query("BEGIN");
        await verify.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
        await verify.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
        const admins = await verify.query(
          `SELECT actor_id, assignment_status, version
             FROM eper_workflow_actor_role_assignment
            WHERE tenant_id=$1 AND application_id=$2 AND role_id=$3
            ORDER BY actor_id`,
          [tenantId, applicationId, roleId],
        );
        assert.equal(admins.rows.filter(row => row.assignment_status === "active").length, 1);
        assert.ok(admins.rows.some(row => row.actor_id === firstAdminId));
        assert.ok(admins.rows.some(row => row.actor_id === recoveredAdminId));

        const invalidatedSession = await verify.query(
          `SELECT revoked_at, revoked_reason FROM eper_customer_browser_sessions
            WHERE session_hash=$1 AND tenant_id=$2 AND actor_id=$3`,
          [firstAdminSessionHash, tenantId, firstAdminId],
        );
        assert.equal(invalidatedSession.rows.length, 1);
        assert.ok(invalidatedSession.rows[0].revoked_at);
        assert.equal(invalidatedSession.rows[0].revoked_reason, "platform_customer_admin_role_changed");
        const ledger = await verify.query(
          `SELECT operation, platform_actor_id, credential_id, target_actor_id,
                  assignment_version, completed_at
             FROM eper_platform_admin_operation_idempotency
            WHERE tenant_id=$1 AND application_id=$2
            ORDER BY operation`,
          [tenantId, applicationId],
        );
        assert.deepEqual(ledger.rows.map(row => row.operation), ["provision", "recover", "recover"]);
        assert.ok(ledger.rows.every(row => row.platform_actor_id === platformActorId &&
          row.credential_id === principal.credentialId && row.completed_at));

        const audit = await verify.query(
          `SELECT action, actor_id, resource_id, idempotency_key
             FROM eper_audit_events
            WHERE tenant_id=$1 AND application_id=$2
              AND action IN ('platform.customer_admin.provision','platform.customer_admin.recover')
            ORDER BY occurred_at`,
          [tenantId, applicationId],
        );
        assert.deepEqual(audit.rows.map(row => row.action), [
          "platform.customer_admin.provision",
          "platform.customer_admin.recover",
          "platform.customer_admin.recover",
        ]);
        assert.ok(audit.rows.every(row => row.actor_id === platformActorId));
        await verify.query("COMMIT");
      } catch (error) {
        try { await verify.query("ROLLBACK"); } catch { /* preserve original error */ }
        throw error;
      } finally { verify.release(); }
    } finally {
      await pool.end();
    }
  });
