import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { PostgresActorApplicationAssignmentStore } from "../dist/packages/identity/postgres-actor-application-assignment-store.js";
import { PostgresTenantApplicationAssignmentStore } from "../dist/packages/identity/postgres-tenant-application-assignment-store.js";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

test("live PostgreSQL tenant and actor application assignments: migrations, concurrency, revocation and audit rollback",
  { skip: !connectionString || process.env.EPER_IDENTITY_ASSIGNMENT_LIVE_TESTS !== "1" }, async t => {
    const pool = new Pool({ connectionString, max: 8 });
    const suffix = randomUUID().replaceAll("-", "");
    const tenantId = "ia-tenant-" + suffix.slice(0, 24);
    const actorId = "ia-actor-" + suffix.slice(0, 24);
    const applicationId = "ia-app-" + suffix.slice(0, 24);
    const rollbackApplicationId = "ia-fail-" + suffix.slice(0, 24);
    const changedBy = "ci-assignment-test";
    const common = { tenantId, changedBy, environment: "sandbox", correlationId: "identity-assignment-" + suffix };
    const tenantStore = new PostgresTenantApplicationAssignmentStore(pool);
    const actorStore = new PostgresActorApplicationAssignmentStore(pool);
    let triggerName;
    let functionName;

    try {
      await t.test("both migrations are applied and assignment stores are ready", async () => {
        await tenantStore.assertReady();
        await actorStore.assertReady();
        const schema = await pool.query(`
          SELECT
            to_regclass('public.eper_tenant_application_assignment') IS NOT NULL AS tenant_table,
            to_regclass('public.eper_actor_application_assignment') IS NOT NULL AS actor_table,
            EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='eper_tenant_application_assignment_active_idx') AS tenant_active_index,
            EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='eper_actor_application_assignment_active_idx') AS actor_active_index
        `);
        assert.deepEqual(schema.rows[0], { tenant_table: true, actor_table: true, tenant_active_index: true, actor_active_index: true });
      });

      await t.test("tenant ownership and actor membership jointly grant access", async () => {
        const tenant = await tenantStore.assign({ ...common, applicationId, expectedVersion: 0 });
        assert.equal(tenant.status, "active");
        assert.equal(tenant.version, 1);
        assert.deepEqual(await tenantStore.listActive(tenantId), [applicationId]);
        assert.deepEqual(await actorStore.listActive(tenantId, actorId), []);
        const actor = await actorStore.assign({ ...common, actorId, applicationId, expectedVersion: 0 });
        assert.equal(actor.status, "active");
        assert.equal(actor.version, 1);
        assert.equal(await actorStore.isAssigned(tenantId, actorId, applicationId), true);
      });

      await t.test("concurrent writes using one expected version serialize to one commit", async () => {
        const attempts = await Promise.allSettled([
          actorStore.assign({ ...common, actorId, applicationId, expectedVersion: 1 }),
          actorStore.assign({ ...common, actorId, applicationId, expectedVersion: 1 }),
        ]);
        assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
        const rejected = attempts.find(result => result.status === "rejected");
        assert.match(String(rejected?.reason?.message), /ACTOR_APPLICATION_ASSIGNMENT_VERSION_CONFLICT/);
        const history = await actorStore.listAssignments(tenantId, actorId);
        assert.equal(history.find(row => row.applicationId === applicationId)?.version, 2);
      });

      await t.test("revocation blocks access immediately and regrant advances the version", async () => {
        const revoked = await actorStore.revoke({ ...common, actorId, applicationId, expectedVersion: 2 });
        assert.equal(revoked.status, "revoked");
        assert.equal(await actorStore.isAssigned(tenantId, actorId, applicationId), false);
        const regranted = await actorStore.assign({ ...common, actorId, applicationId, expectedVersion: 3 });
        assert.equal(regranted.status, "active");
        assert.equal(regranted.version, 4);
        const tenantRevoked = await tenantStore.revoke({ ...common, applicationId, expectedVersion: 1 });
        assert.equal(tenantRevoked.status, "revoked");
        assert.deepEqual(await tenantStore.listActive(tenantId), []);
      });

      await t.test("audit insert failure rolls back the assignment mutation", async () => {
        functionName = "eper_test_assignment_audit_fail_" + suffix;
        triggerName = "eper_test_assignment_audit_trigger_" + suffix;
        await pool.query(`
          CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $inject$
          BEGIN
            IF NEW.application_id = '${rollbackApplicationId}' THEN
              RAISE EXCEPTION 'INJECTED_ASSIGNMENT_AUDIT_FAILURE' USING ERRCODE = 'P0001';
            END IF;
            RETURN NEW;
          END
          $inject$
        `);
        await pool.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON eper_audit_events FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
        try {
          await assert.rejects(
            actorStore.assign({ ...common, actorId, applicationId: rollbackApplicationId, expectedVersion: 0 }),
            /INJECTED_ASSIGNMENT_AUDIT_FAILURE/,
          );
          assert.equal(await actorStore.isAssigned(tenantId, actorId, rollbackApplicationId), false);
          assert.deepEqual(
            (await actorStore.listAssignments(tenantId, actorId)).map(row => row.applicationId),
            [applicationId],
          );
        } finally {
          await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON eper_audit_events`);
          await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
          triggerName = undefined;
          functionName = undefined;
        }
      });
    } finally {
      if (triggerName) await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON eper_audit_events`).catch(() => {});
      if (functionName) await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`).catch(() => {});
      await pool.query("DELETE FROM eper_actor_application_assignment WHERE tenant_id=$1", [tenantId]).catch(() => {});
      await pool.query("DELETE FROM eper_tenant_application_assignment WHERE tenant_id=$1", [tenantId]).catch(() => {});
      // Audit rows are append-only by design; unique CI tenant IDs isolate their evidence.
      await pool.end();
    }
  });
