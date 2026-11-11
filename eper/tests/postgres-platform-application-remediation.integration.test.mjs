import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPostgresPaymentPool } from "../dist/packages/payments/postgres-payment-runtime.js";
import { PostgresPlatformApplicationRemediationStore } from "../dist/packages/workflows/postgres-platform-application-remediation-store.js";

const databaseConfigured = Boolean(process.env.EPER_PAYMENT_DATABASE_URL || process.env.DATABASE_URL);

test("PostgreSQL platform application remediation is tenant-scoped, versioned, idempotent and audit-atomic",
  { skip: !databaseConfigured },
  async () => {
    const pool = createPostgresPaymentPool();
    const store = new PostgresPlatformApplicationRemediationStore(pool);
    const suffix = randomUUID().replaceAll("-", "");
    const tariffKey = "remediation-tariff-" + suffix;
    const principal = {
      platformActorId: "platform-operator-" + suffix,
      credentialId: "platform-key-" + suffix,
      permissions: ["application:remediate"],
    };
    const tenants = [
      {
        tenantId: "remediation-tenant-" + suffix,
        applicationIds: ["remediation-target-" + suffix, "remediation-keep-" + suffix],
      },
      {
        tenantId: "remediation-foreign-" + suffix,
        applicationIds: ["remediation-foreign-app-" + suffix],
      },
      {
        tenantId: "remediation-concurrent-" + suffix,
        applicationIds: ["remediation-concurrent-app-" + suffix],
      },
      {
        tenantId: "remediation-rollback-" + suffix,
        applicationIds: ["remediation-rollback-app-" + suffix],
      },
    ];
    const environment = "sandbox";
    const correlationId = "remediation-correlation-" + suffix;
    const triggerName = "eper_test_remediation_audit_" + suffix;
    const functionName = "eper_test_remediation_audit_fn_" + suffix;
    let triggerInstalled = false;

    async function withScope(tenantId, applicationId, operation) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
        await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
        const result = await operation(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
        throw error;
      } finally {
        client.release();
      }
    }

    async function seedTenant(tenant) {
      await pool.query(
        `INSERT INTO eper_customer_account
          (tenant_id, customer_status, status_reason, effective_at, version, updated_at, updated_by)
         VALUES ($1, 'active', 'remediation integration fixture', NOW() - INTERVAL '1 minute', 1, NOW(), $2)`,
        [tenant.tenantId, principal.platformActorId],
      );
      await pool.query(
        `INSERT INTO eper_customer_tariff_assignment
          (tenant_id, tariff_key, tariff_version, billing_basis, max_applications,
           accepted_amount, accepted_currency, billing_interval, assignment_status,
           starts_at, ends_at, version, updated_at, updated_by, accepted_by, accepted_at, acceptance_reference)
         VALUES ($1, $2, 1, 'single_application', 1, 100, 'INR', 'monthly',
                 'active', NOW() - INTERVAL '1 day', NULL, 1, NOW(), $3, $3, NOW(), $4)`,
        [tenant.tenantId, tariffKey, principal.platformActorId, "accepted-" + tenant.tenantId],
      );
      for (const applicationId of tenant.applicationIds) {
        await pool.query(
          `INSERT INTO eper_tenant_application_assignment
            (tenant_id, application_id, assignment_status, assigned_by, updated_by)
           VALUES ($1, $2, 'active', $3, $3)`,
          [tenant.tenantId, applicationId, principal.platformActorId],
        );
      }
    }

    async function ledgerCount(tenantId, applicationId, idempotencyKey) {
      return withScope(tenantId, applicationId, async client => {
        const result = await client.query(
          `SELECT COUNT(*)::int AS count
             FROM eper_platform_application_remediation_idempotency
            WHERE tenant_id=$1 AND application_id=$2 AND idempotency_key=$3`,
          [tenantId, applicationId, idempotencyKey],
        );
        return result.rows[0].count;
      });
    }

    async function cleanupTenant(tenant) {
      for (const applicationId of tenant.applicationIds) {
        await withScope(tenant.tenantId, applicationId, client =>
          client.query(
            `DELETE FROM eper_platform_application_remediation_idempotency
              WHERE tenant_id=$1 AND application_id=$2`,
            [tenant.tenantId, applicationId],
          ).then(() => undefined),
        ).catch(() => undefined);
      }
      await pool.query("DELETE FROM eper_tenant_application_assignment WHERE tenant_id=$1", [tenant.tenantId]).catch(() => undefined);
      await pool.query("DELETE FROM eper_customer_tariff_assignment WHERE tenant_id=$1", [tenant.tenantId]).catch(() => undefined);
      await pool.query("DELETE FROM eper_customer_account WHERE tenant_id=$1", [tenant.tenantId]).catch(() => undefined);
    }

    try {
      await store.assertReady();
      await pool.query(
        `INSERT INTO eper_commercial_tariff_plan
          (tariff_key, tariff_version, billing_basis, max_applications, amount, currency,
           billing_interval, effective_from, effective_to, tariff_status, created_by,
           change_reason, approval_required, approval_state, published_at, published_by)
         VALUES ($1, 1, 'single_application', 1, 100, 'INR', 'monthly',
                 NOW() - INTERVAL '1 day', NULL, 'active', $2,
                 'platform remediation integration', FALSE, 'not_required', NOW(), $2)`,
        [tariffKey, principal.platformActorId],
      );
      for (const tenant of tenants) await seedTenant(tenant);

      const [primary, foreign, concurrent, rollback] = tenants;
      const targetApplicationId = primary.applicationIds[0];
      const keepApplicationId = primary.applicationIds[1];
      const idempotencyKey = "remediate-" + suffix;
      const input = {
        principal,
        tenantId: primary.tenantId,
        applicationId: targetApplicationId,
        expectedAssignmentVersion: 1,
        reasonTicketReference: "INC-REMEDIATION-" + suffix,
        idempotencyKey,
        correlationId,
        environment,
        serviceVersion: "postgres-integration",
      };

      const result = await store.remediate(input);
      assert.equal(result.assignmentStatus, "revoked");
      assert.equal(result.assignmentVersion, 2);
      assert.equal(result.activeApplicationCount, 1);
      assert.equal(result.maxApplications, 1);
      assert.equal(result.tariffAccessState, "within_allowance");
      assert.equal(result.replayed, false);

      await assert.rejects(
        store.remediate({
          ...input,
          applicationId: keepApplicationId,
          expectedAssignmentVersion: 2,
          idempotencyKey: "stale-version-" + suffix,
        }),
        /PLATFORM_APPLICATION_REMEDIATION_VERSION_CONFLICT/,
      );
      const unchangedAssignment = await pool.query(
        `SELECT assignment_status, version
           FROM eper_tenant_application_assignment
          WHERE tenant_id=$1 AND application_id=$2`,
        [primary.tenantId, keepApplicationId],
      );
      assert.deepEqual(
        [unchangedAssignment.rows[0].assignment_status, Number(unchangedAssignment.rows[0].version)],
        ["active", 1],
      );

      const assignmentsAfter = await pool.query(
        `SELECT application_id, assignment_status, version
           FROM eper_tenant_application_assignment
          WHERE tenant_id=$1 ORDER BY application_id`,
        [primary.tenantId],
      );
      assert.deepEqual(
        assignmentsAfter.rows.map(row => [row.application_id, row.assignment_status, Number(row.version)]),
        [[keepApplicationId, "active", 1], [targetApplicationId, "revoked", 2]].sort((a, b) => a[0].localeCompare(b[0])),
      );

      const auditBeforeReplay = await pool.query(
        `SELECT COUNT(*)::int AS count
           FROM eper_audit_events
          WHERE tenant_id=$1 AND application_id=$2
            AND action='platform.application_assignment.remediate'
            AND idempotency_key=$3`,
        [primary.tenantId, targetApplicationId, idempotencyKey],
      );
      assert.equal(auditBeforeReplay.rows[0].count, 1);
      assert.equal(await ledgerCount(primary.tenantId, targetApplicationId, idempotencyKey), 1);

      const replay = await store.remediate(input);
      assert.equal(replay.replayed, true);
      assert.equal(replay.assignmentVersion, 2);
      assert.equal(replay.activeApplicationCount, 1);
      const auditAfterReplay = await pool.query(
        `SELECT COUNT(*)::int AS count
           FROM eper_audit_events
          WHERE tenant_id=$1 AND application_id=$2
            AND action='platform.application_assignment.remediate'
            AND idempotency_key=$3`,
        [primary.tenantId, targetApplicationId, idempotencyKey],
      );
      assert.equal(auditAfterReplay.rows[0].count, 1);

      await assert.rejects(
        store.remediate({ ...input, reasonTicketReference: "different-reason" }),
        /PLATFORM_APPLICATION_REMEDIATION_IDEMPOTENCY_KEY_REUSED/,
      );

      await assert.rejects(
        store.remediate({
          ...input,
          applicationId: foreign.applicationIds[0],
          idempotencyKey: "cross-tenant-" + suffix,
        }),
        /PLATFORM_APPLICATION_REMEDIATION_ASSIGNMENT_NOT_ACTIVE/,
      );
      const foreignAssignment = await pool.query(
        `SELECT assignment_status, version
           FROM eper_tenant_application_assignment
          WHERE tenant_id=$1 AND application_id=$2`,
        [foreign.tenantId, foreign.applicationIds[0]],
      );
      assert.deepEqual(
        [foreignAssignment.rows[0].assignment_status, Number(foreignAssignment.rows[0].version)],
        ["active", 1],
      );

      const concurrentInput = {
        principal, tenantId: concurrent.tenantId, applicationId: concurrent.applicationIds[0],
        expectedAssignmentVersion: 1, reasonTicketReference: "INC-CONCURRENT-" + suffix,
        correlationId, environment, serviceVersion: "postgres-integration",
      };
      const outcomes = await Promise.allSettled([
        store.remediate({ ...concurrentInput, idempotencyKey: "concurrent-a-" + suffix }),
        store.remediate({ ...concurrentInput, idempotencyKey: "concurrent-b-" + suffix }),
      ]);
      assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
      assert.equal(outcomes.filter(outcome => outcome.status === "rejected").length, 1);
      const rejected = outcomes.find(outcome => outcome.status === "rejected");
      assert.match(String(rejected.reason?.message),
        /PLATFORM_APPLICATION_REMEDIATION_ASSIGNMENT_NOT_ACTIVE|PLATFORM_APPLICATION_REMEDIATION_VERSION_CONFLICT/);
      const concurrentAssignment = await pool.query(
        `SELECT assignment_status, version
           FROM eper_tenant_application_assignment
          WHERE tenant_id=$1 AND application_id=$2`,
        [concurrent.tenantId, concurrent.applicationIds[0]],
      );
      assert.deepEqual(
        [concurrentAssignment.rows[0].assignment_status, Number(concurrentAssignment.rows[0].version)],
        ["revoked", 2],
      );
      const concurrentAudit = await pool.query(
        `SELECT COUNT(*)::int AS count FROM eper_audit_events
          WHERE tenant_id=$1 AND application_id=$2
            AND action='platform.application_assignment.remediate'`,
        [concurrent.tenantId, concurrent.applicationIds[0]],
      );
      assert.equal(concurrentAudit.rows[0].count, 1);

      const installTriggerClient = await pool.connect();
      try {
        await installTriggerClient.query("BEGIN");
        await installTriggerClient.query("SELECT pg_advisory_xact_lock(hashtext('eper.audit_events.test-trigger-ddl.v1'))");
        await installTriggerClient.query(
          `CREATE FUNCTION public.${functionName}() RETURNS trigger
           LANGUAGE plpgsql AS $eper$
           BEGIN
             IF NEW.tenant_id = '${rollback.tenantId}'
                AND NEW.action = 'platform.application_assignment.remediate' THEN
               RAISE EXCEPTION 'INJECTED_PLATFORM_APPLICATION_REMEDIATION_AUDIT_FAILURE';
             END IF;
             RETURN NEW;
           END;
           $eper$`,
        );
        await installTriggerClient.query(
          `CREATE TRIGGER ${triggerName}
           BEFORE INSERT ON eper_audit_events
           FOR EACH ROW EXECUTE FUNCTION public.${functionName}()`,
        );
        await installTriggerClient.query("COMMIT");
        triggerInstalled = true;
      } catch (error) {
        try { await installTriggerClient.query("ROLLBACK"); } catch { /* preserve original error */ }
        throw error;
      } finally { installTriggerClient.release(); }

      const rollbackIdempotencyKey = "rollback-" + suffix;
      await assert.rejects(
        store.remediate({
          principal, tenantId: rollback.tenantId, applicationId: rollback.applicationIds[0],
          expectedAssignmentVersion: 1, reasonTicketReference: "INC-ROLLBACK-" + suffix,
          idempotencyKey: rollbackIdempotencyKey, correlationId, environment,
          serviceVersion: "postgres-integration",
        }),
        /INJECTED_PLATFORM_APPLICATION_REMEDIATION_AUDIT_FAILURE/,
      );
      const rollbackAssignment = await pool.query(
        `SELECT assignment_status, version
           FROM eper_tenant_application_assignment
          WHERE tenant_id=$1 AND application_id=$2`,
        [rollback.tenantId, rollback.applicationIds[0]],
      );
      assert.deepEqual(
        [rollbackAssignment.rows[0].assignment_status, Number(rollbackAssignment.rows[0].version)],
        ["active", 1],
      );
      assert.equal(await ledgerCount(rollback.tenantId, rollback.applicationIds[0], rollbackIdempotencyKey), 0);
    } finally {
      if (triggerInstalled) {
        const cleanupTriggerClient = await pool.connect();
        try {
          await cleanupTriggerClient.query("BEGIN");
          await cleanupTriggerClient.query("SELECT pg_advisory_xact_lock(hashtext('eper.audit_events.test-trigger-ddl.v1'))");
          await cleanupTriggerClient.query(`DROP TRIGGER IF EXISTS ${triggerName} ON eper_audit_events`);
          await cleanupTriggerClient.query(`DROP FUNCTION IF EXISTS public.${functionName}()`);
          await cleanupTriggerClient.query("COMMIT");
        } catch (error) {
          try { await cleanupTriggerClient.query("ROLLBACK"); } catch { /* preserve original error */ }
          // Best-effort cleanup remains isolated from the test's primary failure.
        } finally { cleanupTriggerClient.release(); }
      }
      for (const tenant of tenants) await cleanupTenant(tenant);
      await pool.query("DELETE FROM eper_commercial_tariff_plan WHERE tariff_key=$1", [tariffKey]).catch(() => undefined);
      await pool.end();
    }
  });
