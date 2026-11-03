import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresProviderConnectionRepository } from "../dist/packages/integrations/postgres-provider-connection-repository.js";
import { PostgresEncryptedProviderPayloadStore } from "../dist/packages/integrations/postgres-encrypted-provider-payload-store.js";
import {
  PostgresProviderOperationRepository,
  ProviderOperationStateConflictError,
} from "../dist/packages/integrations/postgres-provider-operation-repository.js";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

test("provider operation queue persists claims, renewal, fencing, retry exhaustion and recovery in PostgreSQL",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 10 });
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const tenantId = "provider-op-tenant-" + suffix;
    const applicationId = "provider-op-app-" + suffix;
    const actorId = "provider-op-admin-" + suffix;
    const providerKey = "provider-op-" + suffix;
    const connectionRepository = new PostgresProviderConnectionRepository(pool);
    const operationRepository = new PostgresProviderOperationRepository(pool);
    const payloadStore = new PostgresEncryptedProviderPayloadStore(
      pool, Buffer.alloc(32, 23), {
        async authorize() { return true; },
        async authorizeCreate() { return true; },
      },
    );
    let connectionId;
    const auditEnvironment = "sandbox";

    try {
      await pool.query(
        "INSERT INTO eper_provider_definitions (provider_key,display_name,adapter_key,adapter_version,capabilities,auth_modes,configuration_schema,provider_status,updated_by) VALUES ($1,$2,$3,'1',$4::jsonb,$5::jsonb,'{}'::jsonb,'ACTIVE',$6)",
        [providerKey, "Provider operation lifecycle test", "synthetic-test-adapter",
          JSON.stringify(["email.send"]), JSON.stringify(["oauth"]), actorId],
      );

      const created = await connectionRepository.createAndBindApplication({
        tenantId, applicationId, actorId, providerKey,
        displayName: "Synthetic mail connection", authMode: "oauth",
        secretReference: "synthetic://provider-operation-test/" + suffix,
        environment: "sandbox", allowedCapabilities: ["email.send"],
        correlationId: "connection-create-" + suffix, auditEnvironment,
      });
      connectionId = created.connection.connectionId;
      await pool.query(
        "UPDATE eper_provider_connections SET connection_status='ACTIVE' WHERE tenant_id=$1 AND connection_id=$2",
        [tenantId, connectionId],
      );
      await pool.query(
        "UPDATE eper_provider_connection_applications SET binding_status='ACTIVE' WHERE tenant_id=$1 AND application_id=$2 AND connection_id=$3",
        [tenantId, applicationId, connectionId],
      );

      const enqueue = (key) => operationRepository.enqueue({
        tenantId, applicationId, connectionId, capabilityKey: "email.send",
        capabilityVersion: "1", idempotencyKey: key,
        correlationId: "operation-" + key, requestDigest: "a".repeat(64),
        payloadReference: "opaque-payload-" + key, actorId, auditEnvironment,
      });

      const first = await enqueue("lifecycle-" + suffix);
      assert.equal(first.created, true);
      assert.equal(first.operation.status, "QUEUED");
      assert.equal(first.operation.attemptCount, 0);
      const duplicate = await enqueue("lifecycle-" + suffix);
      assert.equal(duplicate.created, false);
      assert.equal(duplicate.operation.operationId, first.operation.operationId);

      const claims = await Promise.all([
        operationRepository.claimNext({
          tenantId, applicationId, workerId: "worker-a-" + suffix,
          leaseDurationSeconds: 30, maxAttempts: 3, auditEnvironment,
        }),
        operationRepository.claimNext({
          tenantId, applicationId, workerId: "worker-b-" + suffix,
          leaseDurationSeconds: 30, maxAttempts: 3, auditEnvironment,
        }),
      ]);
      assert.equal(claims.filter(Boolean).length, 1);
      assert.equal(claims.filter(value => value === null).length, 1);
      const firstClaim = claims.find(Boolean);
      assert.equal(firstClaim.status, "DISPATCHING");
      assert.equal(firstClaim.attemptCount, 1);
      assert.equal(firstClaim.fencingToken, 1);

      const renewed = await operationRepository.renewLease({
        tenantId, applicationId, operationId: firstClaim.operationId,
        workerId: firstClaim.leaseOwner, fencingToken: firstClaim.fencingToken,
        leaseDurationSeconds: 60, auditEnvironment,
      });
      assert.equal(renewed.fencingToken, firstClaim.fencingToken);
      assert.ok(Date.parse(renewed.leaseExpiresAt) >= Date.parse(firstClaim.leaseExpiresAt));

      const retry = await operationRepository.recordOutcome({
        tenantId, applicationId, operationId: firstClaim.operationId,
        workerId: firstClaim.leaseOwner, fencingToken: firstClaim.fencingToken,
        outcome: "RETRY", errorCode: "SYNTHETIC_RETRY",
        retryAfterSeconds: 1, maxAttempts: 3, auditEnvironment,
      });
      assert.equal(retry.status, "RETRYING");
      await pool.query(
        "UPDATE eper_provider_operations SET available_at=NOW()-INTERVAL '1 second' WHERE tenant_id=$1 AND application_id=$2 AND operation_id=$3",
        [tenantId, applicationId, firstClaim.operationId],
      );

      const secondClaim = await operationRepository.claimNext({
        tenantId, applicationId, workerId: "worker-restarted-" + suffix,
        leaseDurationSeconds: 30, maxAttempts: 3, auditEnvironment,
      });
      assert.equal(secondClaim.attemptCount, 2);
      assert.equal(secondClaim.fencingToken, 2);

      await assert.rejects(() => operationRepository.recordOutcome({
        tenantId, applicationId, operationId: firstClaim.operationId,
        workerId: firstClaim.leaseOwner, fencingToken: firstClaim.fencingToken,
        outcome: "SUCCEEDED", providerReference: "synthetic-stale-result", auditEnvironment,
      }), error => error instanceof ProviderOperationStateConflictError);

      await pool.query(
        "UPDATE eper_provider_operations SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE tenant_id=$1 AND application_id=$2 AND operation_id=$3",
        [tenantId, applicationId, secondClaim.operationId],
      );
      const thirdClaim = await operationRepository.claimNext({
        tenantId, applicationId, workerId: "worker-recovered-" + suffix,
        leaseDurationSeconds: 30, maxAttempts: 3, auditEnvironment,
      });
      assert.equal(thirdClaim.attemptCount, 3);
      assert.equal(thirdClaim.fencingToken, 3);

      const exhausted = await operationRepository.recordOutcome({
        tenantId, applicationId, operationId: thirdClaim.operationId,
        workerId: thirdClaim.leaseOwner, fencingToken: thirdClaim.fencingToken,
        outcome: "RETRY", errorCode: "SYNTHETIC_RETRY_EXHAUSTED",
        retryAfterSeconds: 1, maxAttempts: 3, auditEnvironment,
      });
      assert.equal(exhausted.status, "NEEDS_ATTENTION");
      assert.equal(exhausted.leaseOwner, null);

      const recoveryQueued = await enqueue("recovery-" + suffix);
      const recoveryClaim = await operationRepository.claimNext({
        tenantId, applicationId, workerId: "worker-crashed-" + suffix,
        leaseDurationSeconds: 30, maxAttempts: 1, auditEnvironment,
      });
      assert.equal(recoveryClaim.operationId, recoveryQueued.operation.operationId);
      await pool.query(
        "UPDATE eper_provider_operations SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE tenant_id=$1 AND application_id=$2 AND operation_id=$3",
        [tenantId, applicationId, recoveryClaim.operationId],
      );
      const recovered = await operationRepository.recoverExpiredLeases({
        tenantId, applicationId, maxAttempts: 1, batchSize: 10, auditEnvironment,
      });
      assert.equal(recovered.length, 1);
      assert.equal(recovered[0].operationId, recoveryClaim.operationId);
      assert.equal(recovered[0].status, "NEEDS_ATTENTION");

      const persisted = await pool.query(
        "SELECT operation_status,attempt_count,fencing_token FROM eper_provider_operations WHERE tenant_id=$1 AND application_id=$2 ORDER BY created_at,operation_id",
        [tenantId, applicationId],
      );
      assert.deepEqual(persisted.rows.map(row => row.operation_status), ["NEEDS_ATTENTION", "NEEDS_ATTENTION"]);
      assert.equal(Number(persisted.rows[0].attempt_count), 3);
      assert.equal(Number(persisted.rows[0].fencing_token), 3);
      const audit = await pool.query(
        "SELECT action FROM eper_audit_events WHERE tenant_id=$1 AND application_id=$2 AND resource_type='provider-operation'",
        [tenantId, applicationId],
      );
      assert.ok(audit.rows.length >= 10, "queue, claim, renewal, retry and recovery transitions must be audited");

      const providerPayload = {
        to: ["synthetic@example.invalid"],
        body: "atomic-payload-" + suffix,
      };
      const payloadDigest = createHash("sha256")
        .update(JSON.stringify(providerPayload), "utf8").digest("hex");
      const atomicInput = {
        tenantId, applicationId, connectionId, capabilityKey: "email.send",
        capabilityVersion: "1", idempotencyKey: "atomic-" + suffix,
        correlationId: "atomic-correlation-" + suffix, requestDigest: payloadDigest,
        actorId, auditEnvironment, payload: providerPayload, payloadStore,
      };
      const atomicFirst = await operationRepository.enqueueWithPayload(atomicInput);
      assert.equal(atomicFirst.created, true);
      assert.equal(atomicFirst.operation.requestDigest, payloadDigest);
      assert.deepEqual(await payloadStore.get({
        tenantId, applicationId, operationId: atomicFirst.operation.operationId,
        capabilityKey: "email.send", reference: atomicFirst.operation.payloadReference,
        digest: payloadDigest,
      }), providerPayload);
      const payloadCountAfterCreate = await pool.query(
        "SELECT COUNT(*)::int AS count FROM eper_provider_payloads WHERE tenant_id=$1 AND application_id=$2 AND operation_id=$3",
        [tenantId, applicationId, atomicFirst.operation.operationId],
      );
      assert.equal(payloadCountAfterCreate.rows[0].count, 1, "initial enqueue must create exactly one payload");
      const atomicDuplicate = await operationRepository.enqueueWithPayload(atomicInput);
      assert.equal(atomicDuplicate.created, false);
      assert.equal(atomicDuplicate.operation.operationId, atomicFirst.operation.operationId);
      const payloadCountAfterRetry = await pool.query(
        "SELECT COUNT(*)::int AS count FROM eper_provider_payloads WHERE tenant_id=$1 AND application_id=$2 AND operation_id=$3",
        [tenantId, applicationId, atomicFirst.operation.operationId],
      );
      assert.equal(payloadCountAfterRetry.rows[0].count, 1, "idempotent retry must not create an orphan duplicate payload");
    } finally {
      if (connectionId) {
        await pool.query("DELETE FROM eper_provider_payloads WHERE tenant_id=$1 AND application_id=$2", [tenantId, applicationId]).catch(() => undefined);
        await pool.query("DELETE FROM eper_provider_operations WHERE tenant_id=$1 AND application_id=$2", [tenantId, applicationId]).catch(() => undefined);
        await pool.query("DELETE FROM eper_provider_connection_applications WHERE tenant_id=$1 AND application_id=$2", [tenantId, applicationId]).catch(() => undefined);
        await pool.query("DELETE FROM eper_provider_connections WHERE tenant_id=$1 AND connection_id=$2", [tenantId, connectionId]).catch(() => undefined);
      }
      await pool.query("DELETE FROM eper_provider_definitions WHERE provider_key=$1", [providerKey]).catch(() => undefined);
      await pool.end();
    }
  });
