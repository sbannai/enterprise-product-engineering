import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { PostgresActorApplicationAssignmentStore } from "../dist/packages/identity/postgres-actor-application-assignment-store.js";
import { PostgresTenantApplicationAssignmentStore } from "../dist/packages/identity/postgres-tenant-application-assignment-store.js";
import { PostgresCommercialTariffAdminStore } from "../dist/packages/pricing/postgres-commercial-tariff-admin-store.js";

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
    const limitApplicationId = "ia-limit-" + suffix.slice(0, 24);
    const overLimitApplicationId = "ia-over-" + suffix.slice(0, 24);
    const tariffKey = "ia-tariff-" + suffix.slice(0, 24);
    const changedBy = "ci-assignment-test";
    const common = { tenantId, changedBy, environment: "sandbox", correlationId: "identity-assignment-" + suffix };
    const tenantStore = new PostgresTenantApplicationAssignmentStore(pool);
    const actorStore = new PostgresActorApplicationAssignmentStore(pool);
    const tariffAdminStore = new PostgresCommercialTariffAdminStore(pool);
    const catalogueTariffKey = "ia-catalogue-" + suffix.slice(0, 24);
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
            to_regclass('public.eper_customer_account') IS NOT NULL AS customer_table,
            to_regclass('public.eper_commercial_tariff_plan') IS NOT NULL AS tariff_plan_table,
            to_regclass('public.eper_customer_tariff_assignment') IS NOT NULL AS tariff_assignment_table,
            EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='eper_tenant_application_assignment_active_idx') AS tenant_active_index,
            EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='eper_actor_application_assignment_active_idx') AS actor_active_index
        `);
        assert.deepEqual(schema.rows[0], {
          tenant_table: true, actor_table: true, customer_table: true, tariff_plan_table: true,
          tariff_assignment_table: true, tenant_active_index: true, actor_active_index: true,
        });
        await pool.query(`INSERT INTO eper_customer_account
          (tenant_id, customer_status, status_reason, updated_by)
          VALUES ($1, 'active', 'CI commercial control fixture', $2)`, [tenantId, changedBy]);
        await pool.query(`INSERT INTO eper_commercial_tariff_plan
          (tariff_key, tariff_version, billing_basis, max_applications, amount, currency,
           billing_interval, effective_from, tariff_status, created_by)
          VALUES ($1, 1, 'multi_application', 2, 100, 'INR', 'monthly',
                  NOW() - INTERVAL '1 hour', 'active', $2)`, [tariffKey, changedBy]);
        await pool.query(`INSERT INTO eper_customer_tariff_assignment
          (tenant_id, tariff_key, tariff_version, billing_basis, max_applications,
           accepted_amount, accepted_currency, billing_interval, assignment_status,
           starts_at, updated_by)
          VALUES ($1, $2, 1, 'multi_application', 2, 100, 'INR', 'monthly',
                  'active', NOW() - INTERVAL '1 hour', $3)`, [tenantId, tariffKey, changedBy]);
      });

      await t.test("Product Admin tariff lifecycle persists versioned drafts, maker-checker approval and audit", async () => {
        await tariffAdminStore.assertReady();
        const firstStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const secondStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const maker = {
          tenantId, actorId: changedBy, correlationId: "tariff-create-" + suffix,
          environment: "sandbox", serviceVersion: "ci",
        };
        const firstDraft = await tariffAdminStore.createDraft({
          tariffKey: catalogueTariffKey, billingBasis: "single_application", maxApplications: 1,
          amount: "499.00", currency: "INR", billingInterval: "monthly",
          effectiveFrom: firstStart, effectiveTo: secondStart,
          changeReason: "CI verifies immutable tariff version and maker-checker approval",
          approvalRequired: true,
        }, maker);
        assert.equal(firstDraft.tariffVersion, 1);
        assert.equal(firstDraft.tariffStatus, "draft");
        assert.equal(firstDraft.approvalState, "pending");

        await assert.rejects(
          tariffAdminStore.approve({
            tariffKey: catalogueTariffKey, tariffVersion: 1, approvalReference: "SELF-APPROVAL",
          }, maker),
          { message: "TARIFF_MAKER_CANNOT_APPROVE_OWN_CHANGE" },
        );

        const approvalReference = "CI-APPROVAL-" + suffix;
        const approver = {
          ...maker, actorId: changedBy + "-approver", correlationId: "tariff-approve-" + suffix,
        };
        const approved = await tariffAdminStore.approve({
          tariffKey: catalogueTariffKey, tariffVersion: 1, approvalReference,
        }, approver);
        assert.equal(approved.approvalState, "approved");
        assert.equal(approved.approvedBy, approver.actorId);
        assert.equal(approved.approvalReference, approvalReference);

        const publisher = {
          ...maker, actorId: changedBy + "-publisher", correlationId: "tariff-publish-" + suffix,
        };
        const published = await tariffAdminStore.publish({
          tariffKey: catalogueTariffKey, tariffVersion: 1,
        }, publisher);
        assert.equal(published.tariffStatus, "active");
        assert.equal(published.approvalReference, approvalReference);

        const secondDraft = await tariffAdminStore.createDraft({
          tariffKey: catalogueTariffKey, billingBasis: "single_application", maxApplications: 1,
          amount: "599.00", currency: "INR", billingInterval: "monthly",
          effectiveFrom: secondStart, effectiveTo: null,
          changeReason: "CI verifies a new version does not overwrite published history",
          approvalRequired: false,
        }, maker);
        assert.equal(secondDraft.tariffVersion, 2);
        const secondPublished = await tariffAdminStore.publish({
          tariffKey: catalogueTariffKey, tariffVersion: 2,
        }, publisher);
        assert.equal(secondPublished.tariffStatus, "active");

        const versions = (await tariffAdminStore.list(maker))
          .filter(row => row.tariffKey === catalogueTariffKey)
          .sort((left, right) => left.tariffVersion - right.tariffVersion);
        assert.deepEqual(versions.map(row => row.tariffVersion), [1, 2]);
        assert.deepEqual(versions.map(row => Number(row.amount)), [499, 599]);
        assert.equal(versions[0].approvalReference, approvalReference);

        const audit = await pool.query(
          `SELECT action FROM eper_audit_events
           WHERE tenant_id=$1 AND resource_type='commercial_tariff'
             AND resource_id = ANY($2::text[])`,
          [tenantId, [catalogueTariffKey + ":1", catalogueTariffKey + ":2"]],
        );
        assert.deepEqual(
          audit.rows.map(row => row.action).sort(),
          ["commercial.tariff.approved", "commercial.tariff.draft_created",
            "commercial.tariff.draft_created", "commercial.tariff.published",
            "commercial.tariff.published"].sort(),
        );
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

      await t.test("concurrent multi-application activation cannot exceed the purchased count", async () => {
        const attempts = await Promise.allSettled([
          tenantStore.assign({ ...common, applicationId: limitApplicationId, expectedVersion: 0 }),
          tenantStore.assign({ ...common, applicationId: overLimitApplicationId, expectedVersion: 0 }),
        ]);
        assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
        const rejected = attempts.find(result => result.status === "rejected");
        assert.match(String(rejected?.reason?.message), /CUSTOMER_APPLICATION_TARIFF_LIMIT_EXCEEDED/);
        const active = await tenantStore.listActive(tenantId);
        assert.equal(active.length, 2, "one original plus exactly one concurrent activation");
        const extraApplicationId = active.find(id => id !== applicationId);
        assert.ok(extraApplicationId);
        const extraAssignment = (await tenantStore.listAssignments(tenantId))
          .find(row => row.applicationId === extraApplicationId);
        assert.ok(extraAssignment);
        const revoked = await tenantStore.revoke({
          ...common, applicationId: extraApplicationId, expectedVersion: extraAssignment.version,
        });
        assert.equal(revoked.status, "revoked");
      });

      await t.test("tenant assignment concurrent updates serialize on the expected version", async () => {
        const attempts = await Promise.allSettled([
          tenantStore.assign({ ...common, applicationId, expectedVersion: 1 }),
          tenantStore.assign({ ...common, applicationId, expectedVersion: 1 }),
        ]);
        assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
        const rejected = attempts.find(result => result.status === "rejected");
        assert.match(String(rejected?.reason?.message), /TENANT_APPLICATION_ASSIGNMENT_VERSION_CONFLICT/);
        const history = await tenantStore.listAssignments(tenantId);
        assert.equal(history.find(row => row.applicationId === applicationId)?.version, 2);
      });

      await t.test("revocation blocks access immediately and regrant advances the version", async () => {
        const revoked = await actorStore.revoke({ ...common, actorId, applicationId, expectedVersion: 2 });
        assert.equal(revoked.status, "revoked");
        assert.equal(await actorStore.isAssigned(tenantId, actorId, applicationId), false);
        const regranted = await actorStore.assign({ ...common, actorId, applicationId, expectedVersion: 3 });
        assert.equal(regranted.status, "active");
        assert.equal(regranted.version, 4);
        const tenantRevoked = await tenantStore.revoke({ ...common, applicationId, expectedVersion: 2 });
        assert.equal(tenantRevoked.status, "revoked");
        assert.deepEqual(await tenantStore.listActive(tenantId), []);
        const tenantRegranted = await tenantStore.assign({ ...common, applicationId, expectedVersion: 3 });
        assert.equal(tenantRegranted.status, "active");
        assert.equal(tenantRegranted.version, 4);
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
          await assert.rejects(
            tenantStore.assign({ ...common, applicationId: rollbackApplicationId, expectedVersion: 0 }),
            /INJECTED_ASSIGNMENT_AUDIT_FAILURE/,
          );
          assert.deepEqual(await tenantStore.listActive(tenantId), [applicationId]);
        } finally {
          await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON eper_audit_events`);
          await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
          triggerName = undefined;
          functionName = undefined;
        }
      });
      await t.test("customer tariff switching snapshots accepted price and retains immutable assignment history", async () => {
        const customerContext = { ...common, correlationId: "customer-tariff-switch-" + suffix };
        const selectedForRevocation = "app-downgrade-" + suffix;
        await tenantStore.assign({ ...common, applicationId: selectedForRevocation, expectedVersion: 0 });
        const switchedDown = await tenantStore.switchCustomerTariff({
          ...customerContext, tariffKey: catalogueTariffKey, tariffVersion: 2,
          expectedVersion: 1, acceptanceReference: "CI-DOWNGRADE-" + suffix,
          revokeApplications: [{ applicationId: selectedForRevocation, expectedVersion: 1 }],
        });
        assert.deepEqual(await tenantStore.listActive(tenantId), [applicationId]);
        assert.equal(switchedDown.billingBasis, "single_application");
        assert.equal(switchedDown.maxApplications, 1);
        assert.equal(switchedDown.acceptedAmount, "599.0000");
        assert.equal(switchedDown.version, 2);
        assert.equal(switchedDown.acceptedBy, changedBy);
        const switchedUp = await tenantStore.switchCustomerTariff({
          ...customerContext, tariffKey, tariffVersion: 1,
          expectedVersion: 2, acceptanceReference: "CI-UPGRADE-" + suffix,
        });
        assert.equal(switchedUp.billingBasis, "multi_application");
        assert.equal(switchedUp.maxApplications, 2);
        assert.equal(switchedUp.acceptedAmount, "100.0000");
        assert.equal(switchedUp.version, 3);
        const history = await pool.query(
          `SELECT assignment_version, tariff_key, tariff_version, accepted_amount, acceptance_reference
             FROM eper_customer_tariff_assignment_history
            WHERE tenant_id=$1 ORDER BY assignment_version`, [tenantId]);
        assert.deepEqual(history.rows.map(row => Number(row.assignment_version)), [1, 2, 3]);
        assert.equal(history.rows[1].acceptance_reference, "CI-DOWNGRADE-" + suffix);
        assert.equal(history.rows[2].acceptance_reference, "CI-UPGRADE-" + suffix);
      });
      await t.test("customer tariff downgrade audit failure rolls back application revocation and tariff acceptance", async () => {
        const rollbackDowngradeApplicationId = "app-downgrade-rollback-" + suffix;
        await tenantStore.assign({ ...common, applicationId: rollbackDowngradeApplicationId, expectedVersion: 0 });
        functionName = "eper_test_tariff_audit_fail_" + suffix;
        triggerName = "eper_test_tariff_audit_trigger_" + suffix;
        await pool.query(`
          CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $inject$
          BEGIN
            IF NEW.application_id = '${rollbackDowngradeApplicationId}' THEN
              RAISE EXCEPTION 'INJECTED_TARIFF_DOWNGRADE_AUDIT_FAILURE' USING ERRCODE = 'P0001';
            END IF;
            RETURN NEW;
          END
          $inject$
        `);
        await pool.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON eper_audit_events FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
        try {
          await assert.rejects(
            tenantStore.switchCustomerTariff({
              ...customerContext, tariffKey: catalogueTariffKey, tariffVersion: 2,
              expectedVersion: 3, acceptanceReference: "CI-DOWNGRADE-ROLLBACK-" + suffix,
              revokeApplications: [{ applicationId: rollbackDowngradeApplicationId, expectedVersion: 1 }],
            }),
            /INJECTED_TARIFF_DOWNGRADE_AUDIT_FAILURE/,
          );
          assert.deepEqual(
            (await tenantStore.listActive(tenantId)).sort(),
            [applicationId, rollbackDowngradeApplicationId].sort(),
            "failed audit must restore the explicitly selected application assignment",
          );
          const currentAfterFailure = await pool.query(
            "SELECT tariff_key, tariff_version, version FROM eper_customer_tariff_assignment WHERE tenant_id=$1",
            [tenantId],
          );
          assert.equal(Number(currentAfterFailure.rows[0].version), 3);
          assert.equal(Number(currentAfterFailure.rows[0].tariff_version), 1);
          const historyAfterFailure = await pool.query(
            "SELECT assignment_version FROM eper_customer_tariff_assignment_history WHERE tenant_id=$1 ORDER BY assignment_version",
            [tenantId],
          );
          assert.deepEqual(historyAfterFailure.rows.map(row => Number(row.assignment_version)), [1, 2, 3]);
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
      await pool.query("DELETE FROM eper_customer_tariff_assignment_history WHERE tenant_id=$1", [tenantId]).catch(() => {});
      await pool.query("DELETE FROM eper_customer_tariff_assignment WHERE tenant_id=$1", [tenantId]).catch(() => {});
      await pool.query("DELETE FROM eper_customer_account WHERE tenant_id=$1", [tenantId]).catch(() => {});
      await pool.query("DELETE FROM eper_commercial_tariff_plan WHERE tariff_key=$1", [tariffKey]).catch(() => {});
      await pool.query("DELETE FROM eper_commercial_tariff_plan WHERE tariff_key=$1", [catalogueTariffKey]).catch(() => {});
      // Audit rows are append-only by design; unique CI tenant IDs isolate their evidence.
      await pool.end();
    }
  });
