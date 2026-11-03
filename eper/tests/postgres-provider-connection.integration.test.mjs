import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresProviderConnectionRepository } from "../dist/packages/integrations/postgres-provider-connection-repository.js";
import { PostgresProviderValidationStore } from "../dist/packages/integrations/postgres-provider-validation-store.js";
import { ProviderConnectionValidationService } from "../dist/packages/integrations/provider-connection-validation-service.js";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

async function createRuntimePool(pool) {
  await pool.query(`DO $role$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eper_provider_test_runtime') THEN
        EXECUTE 'CREATE ROLE eper_provider_test_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS';
      END IF;
    END
  $role$`);
  await pool.query("GRANT USAGE ON SCHEMA public TO eper_provider_test_runtime");
  await pool.query("GRANT SELECT ON eper_provider_definitions TO eper_provider_test_runtime");
  await pool.query("GRANT UPDATE (provider_status) ON eper_provider_definitions TO eper_provider_test_runtime");
  await pool.query("GRANT SELECT, INSERT, UPDATE, DELETE ON eper_provider_connections TO eper_provider_test_runtime");
  await pool.query("GRANT SELECT, INSERT, UPDATE, DELETE ON eper_provider_connection_applications TO eper_provider_test_runtime");
  await pool.query("GRANT SELECT, INSERT, UPDATE, DELETE ON eper_application_provider_policies TO eper_provider_test_runtime");
  await pool.query("GRANT SELECT, INSERT, UPDATE, DELETE ON eper_provider_operations TO eper_provider_test_runtime");
  await pool.query("GRANT SELECT, INSERT, UPDATE, DELETE ON eper_provider_webhook_receipts TO eper_provider_test_runtime");
  await pool.query("GRANT SELECT, INSERT ON eper_provider_validation_events TO eper_provider_test_runtime");
  await pool.query("GRANT SELECT, INSERT ON eper_audit_events TO eper_provider_test_runtime");
  await pool.query("GRANT SELECT, INSERT, UPDATE ON eper_audit_chain_head TO eper_provider_test_runtime");
  return {
    async connect() {
      const client = await pool.connect();
      try {
        await client.query("SET ROLE eper_provider_test_runtime");
      } catch (error) {
        client.release();
        throw error;
      }
      return {
        query: client.query.bind(client),
        release() {
          void client.query("RESET ROLE").catch(() => undefined).finally(() => client.release());
        },
      };
    },
  };
}

async function withScope(scopedPool, tenantId, applicationId, callback) {
  const client = await scopedPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
    if (applicationId) {
      await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
    }
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

test("provider connections enforce tenant RLS, application-scoped records, rotation suspension and audited revocation",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 6 });
    const scopedPool = await createRuntimePool(pool);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const tenantA = "provider-tenant-a-" + suffix;
    const tenantB = "provider-tenant-b-" + suffix;
    const appA = "provider-app-a-" + suffix;
    const appB = "provider-app-b-" + suffix;
    const actorId = "provider-admin-" + suffix;
    const providerKey = "provider-" + suffix;
    const repository = new PostgresProviderConnectionRepository(scopedPool);
    let connectionId;
    try {
      await pool.query(
        `INSERT INTO eper_provider_definitions
          (provider_key, display_name, adapter_key, adapter_version, capabilities,
           auth_modes, configuration_schema, provider_status, updated_by)
         VALUES ($1,$2,$3,'1', $4::jsonb, $5::jsonb, '{}'::jsonb, 'ACTIVE', $6)`,
        [providerKey, "Integration Provider", "test-adapter",
          JSON.stringify(["email.send", "meeting.create"]), JSON.stringify(["oauth"]), actorId],
      );

      const created = await repository.create({
        tenantId: tenantA, actorId, providerKey, displayName: "Tenant A mail",
        authMode: "oauth", secretReference: "vault://tenant-a/provider/credential-v1",
        environment: "sandbox", correlationId: "create-" + suffix, auditEnvironment: "sandbox",
      });
      connectionId = created.connectionId;
      assert.equal(created.status, "PENDING_VALIDATION");
      assert.equal("secretReference" in created, false);
      assert.equal((await repository.get(tenantA, connectionId))?.connectionId, connectionId);
      assert.equal(await repository.get(tenantB, connectionId), null);

      const unscopedClient = await scopedPool.connect();
      let unscoped;
      try {
        unscoped = await unscopedClient.query(
          "SELECT connection_id FROM eper_provider_connections WHERE connection_id=$1",
          [connectionId],
        );
      } finally {
        unscopedClient.release();
      }
      assert.equal(unscoped.rowCount, 0, "forced RLS denies reads without tenant context");

      const validationStore = new PostgresProviderValidationStore(scopedPool);
      const validation = new ProviderConnectionValidationService(
        validationStore,
        { async resolve(reference) {
          assert.equal(reference, "vault://tenant-a/provider/credential-v1");
          return { token: "synthetic-only" };
        } },
        { get(key, version) {
          assert.equal(key, "test-adapter");
          assert.equal(version, "1");
          return { async validateCredentials(input) {
            assert.equal(input.environment, "sandbox");
            assert.equal(input.credentials.token, "synthetic-only");
            return { ok: true };
          } };
        } },
      );
      await repository.bindApplication({
        tenantId: tenantA, applicationId: appA, connectionId, actorId,
        allowedCapabilities: ["email.send"], correlationId: "bind-" + suffix,
        auditEnvironment: "sandbox",
      });
      const validated = await validation.validate({
        tenantId: tenantA, applicationId: appA, connectionId, actorId, correlationId: "validate-" + suffix,
        auditEnvironment: "sandbox",
      });
      assert.deepEqual(validated, {
        connectionId, outcome: "SUCCEEDED", status: "ACTIVE", version: 2,
      });
      assert.equal(JSON.stringify(validated).includes("synthetic-only"), false);
      const history = await withScope(scopedPool, tenantA, null, async (client) => client.query(
        "SELECT validation_outcome FROM eper_provider_validation_events WHERE tenant_id=$1 AND connection_id=$2",
        [tenantA, connectionId],
      ));
      assert.deepEqual(history.rows.map(row => row.validation_outcome), ["SUCCEEDED"]);
      const appAConnections = await repository.listForApplication(tenantA, appA);
      assert.equal(appAConnections.length, 1);
      assert.equal(appAConnections[0].connectionId, connectionId);
      assert.deepEqual(appAConnections[0].allowedCapabilities, ["email.send"]);
      assert.equal("secretReference" in appAConnections[0], false);
      assert.deepEqual(await repository.listForApplication(tenantA, appB), []);

      const secondConnection = await repository.createAndBindApplication({
        tenantId: tenantA, applicationId: appB, actorId, providerKey,
        displayName: "Tenant A calendar", authMode: "oauth",
        secretReference: "synthetic://tenant-a/calendar-v1",
        environment: "sandbox", allowedCapabilities: ["meeting.create"],
        correlationId: "create-bind-" + suffix, auditEnvironment: "sandbox",
      });
      assert.equal(secondConnection.connection.status, "PENDING_VALIDATION");
      assert.equal(secondConnection.bindingStatus, "PENDING_VALIDATION");
      assert.equal("secretReference" in secondConnection.connection, false);
      const appBConnections = await repository.listForApplication(tenantA, appB);
      assert.equal(appBConnections.length, 1);
      assert.equal(appBConnections[0].displayName, "Tenant A calendar");
      assert.deepEqual(appBConnections[0].allowedCapabilities, ["meeting.create"]);

      const failedValidation = new ProviderConnectionValidationService(
        validationStore,
        { async resolve() { return { token: "synthetic-only" }; } },
        { get() {
          return { async validateCredentials() { return { ok: false, errorCode: "AUTH_REJECTED" }; } };
        } },
      );
      const degraded = await failedValidation.validate({
        tenantId: tenantA, applicationId: appA, connectionId, actorId, correlationId: "validate-fail-" + suffix,
        auditEnvironment: "sandbox",
      });
      assert.deepEqual(degraded, {
        connectionId, outcome: "FAILED", status: "DEGRADED", version: 3,
        errorCode: "AUTH_REJECTED",
      });
      const suspendedAfterFailure = await withScope(scopedPool, tenantA, null, async (client) => client.query(
        "SELECT binding_status FROM eper_provider_connection_applications WHERE tenant_id=$1 AND connection_id=$2",
        [tenantA, connectionId],
      ));
      assert.equal(suspendedAfterFailure.rows[0]?.binding_status, "SUSPENDED");

      await repository.bindApplication({
        tenantId: tenantA, applicationId: appA, connectionId, actorId,
        allowedCapabilities: ["email.send"], correlationId: "rebind-after-failure-" + suffix,
        auditEnvironment: "sandbox",
      });
      const revalidated = await validation.validate({
        tenantId: tenantA, applicationId: appA, connectionId, actorId, correlationId: "validate-retry-" + suffix,
        auditEnvironment: "sandbox",
      });
      assert.equal(revalidated.status, "ACTIVE");
      assert.equal(revalidated.version, 4);
      const historyAfterRetry = await withScope(scopedPool, tenantA, null, async (client) => client.query(
        "SELECT validation_outcome FROM eper_provider_validation_events WHERE tenant_id=$1 AND connection_id=$2 ORDER BY validated_at",
        [tenantA, connectionId],
      ));
      assert.deepEqual(historyAfterRetry.rows.map(row => row.validation_outcome), ["SUCCEEDED", "FAILED", "SUCCEEDED"]);

      await withScope(scopedPool, tenantA, appA, async (client) => {
        await client.query(
          `INSERT INTO eper_application_provider_policies
            (tenant_id, application_id, connection_id, policy, updated_by)
           VALUES ($1,$2,$3,'{"approvalRequired":true}'::jsonb,$4)`,
          [tenantA, appA, connectionId, actorId],
        );
        await client.query(
          `INSERT INTO eper_provider_operations
            (operation_id, tenant_id, application_id, connection_id, capability_key,
             capability_version, idempotency_key, correlation_id, operation_status, request_digest)
           VALUES ($1,$2,$3,$4,'email.send','1',$5,$6,'QUEUED',$7)`,
          [randomUUID(), tenantA, appA, connectionId, "idem-" + suffix,
            "operation-" + suffix, "a".repeat(64)],
        );
        await client.query(
          `INSERT INTO eper_provider_webhook_receipts
            (receipt_id, provider_key, provider_event_id, tenant_id, application_id,
             signature_valid, payload_digest, processing_status)
           VALUES ($1,$2,$3,$4,$5,FALSE,$6,'RECEIVED')`,
          [randomUUID(), providerKey, "event-" + suffix, tenantA, appA, "b".repeat(64)],
        );
      });

      const hiddenFromOtherApplication = await withScope(scopedPool, tenantA, appB, async (client) => {
        const policies = await client.query(
          "SELECT connection_id FROM eper_application_provider_policies WHERE tenant_id=$1",
          [tenantA],
        );
        const operations = await client.query(
          "SELECT operation_id FROM eper_provider_operations WHERE tenant_id=$1",
          [tenantA],
        );
        const receipts = await client.query(
          "SELECT receipt_id FROM eper_provider_webhook_receipts WHERE tenant_id=$1",
          [tenantA],
        );
        return [policies.rowCount, operations.rowCount, receipts.rowCount];
      });
      assert.deepEqual(hiddenFromOtherApplication, [0, 0, 0]);

      const rotated = await repository.rotateSecretReference({
        tenantId: tenantA, applicationId: appA, connectionId, actorId,
        secretReference: "vault://tenant-a/provider/credential-v2",
        expectedVersion: 4, correlationId: "rotate-" + suffix, auditEnvironment: "sandbox",
      });
      assert.equal(rotated.version, 5);
      assert.equal(rotated.status, "PENDING_VALIDATION");
      const suspended = await withScope(scopedPool, tenantA, null, async (client) => client.query(
        "SELECT binding_status FROM eper_provider_connection_applications WHERE tenant_id=$1 AND connection_id=$2",
        [tenantA, connectionId],
      ));
      assert.equal(suspended.rows[0]?.binding_status, "SUSPENDED");

      const revoked = await repository.revoke({
        tenantId: tenantA, applicationId: appA, connectionId, actorId, expectedVersion: 5,
        correlationId: "revoke-" + suffix, auditEnvironment: "sandbox",
      });
      assert.equal(revoked.version, 6);
      assert.equal(revoked.status, "REVOKED");
      const binding = await withScope(scopedPool, tenantA, null, async (client) => client.query(
        "SELECT binding_status FROM eper_provider_connection_applications WHERE tenant_id=$1 AND connection_id=$2",
        [tenantA, connectionId],
      ));
      assert.equal(binding.rows[0]?.binding_status, "REVOKED");
    } finally {
      if (connectionId) {
        await pool.query(
          "DELETE FROM eper_provider_validation_events WHERE tenant_id=$1 AND connection_id=$2",
          [tenantA, connectionId],
        ).catch(() => undefined);
        await withScope(scopedPool, tenantA, appA, async (client) => {
          await client.query(
            "DELETE FROM eper_provider_webhook_receipts WHERE tenant_id=$1 AND application_id=$2",
            [tenantA, appA],
          );
          await client.query(
            "DELETE FROM eper_provider_operations WHERE tenant_id=$1 AND application_id=$2",
            [tenantA, appA],
          );
          await client.query(
            "DELETE FROM eper_application_provider_policies WHERE tenant_id=$1 AND application_id=$2",
            [tenantA, appA],
          );
        }).catch(() => undefined);
        await withScope(scopedPool, tenantA, appB, async (client) => {
          await client.query(
            "DELETE FROM eper_provider_connection_applications WHERE tenant_id=$1 AND application_id=$2",
            [tenantA, appB],
          );
        }).catch(() => undefined);
        await withScope(scopedPool, tenantA, null, async (client) => {
          await client.query(
            "DELETE FROM eper_provider_connection_applications WHERE tenant_id=$1 AND application_id=$2",
            [tenantA, appA],
          );
          await client.query("DELETE FROM eper_provider_connections WHERE tenant_id=$1", [tenantA]);
        }).catch(() => undefined);
      }
      await pool.query("DELETE FROM eper_provider_definitions WHERE provider_key=$1", [providerKey]).catch(() => undefined);
      await pool.end();
    }
  });
