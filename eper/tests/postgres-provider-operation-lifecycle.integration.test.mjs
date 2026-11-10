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

      const enqueue = (key) => {
        const payload = { to: ["synthetic@example.invalid"], body: "lifecycle-" + key };
        const requestDigest = createHash("sha256")
          .update(JSON.stringify(payload), "utf8").digest("hex");
        return operationRepository.enqueueWithPayload({
          tenantId, applicationId, connectionId, capabilityKey: "email.send",
          capabilityVersion: "1", idempotencyKey: key,
          correlationId: "operation-" + key, requestDigest,
          actorId, auditEnvironment, payload, payloadStore,
        });
      };

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
      const exactPayloadReference = {
        tenantId, applicationId, operationId: atomicFirst.operation.operationId,
        capabilityKey: "email.send", reference: atomicFirst.operation.payloadReference,
        digest: payloadDigest,
      };
      assert.deepEqual(await payloadStore.get(exactPayloadReference), providerPayload);
      const persistedEnvelope = await pool.query(
        `SELECT payload_digest,envelope_version,nonce,auth_tag,ciphertext
         FROM eper_provider_payloads
         WHERE payload_reference=$1 AND tenant_id=$2 AND application_id=$3`,
        [exactPayloadReference.reference, tenantId, applicationId],
      );
      assert.equal(persistedEnvelope.rowCount, 1);
      assert.equal(persistedEnvelope.rows[0].envelope_version, 1);
      assert.ok(persistedEnvelope.rows[0].ciphertext.length > 0);
      assert.equal(JSON.stringify(persistedEnvelope.rows[0]).includes(providerPayload.body), false,
        "PostgreSQL must persist only the encrypted envelope, never provider payload plaintext");

      const retentionPayload = { body: "retention-tombstone-" + suffix };
      const retentionDigest = createHash("sha256")
        .update(JSON.stringify(retentionPayload), "utf8").digest("hex");
      const retentionQueued = await operationRepository.enqueueWithPayload({
        tenantId, applicationId, connectionId, capabilityKey: "email.send",
        capabilityVersion: "1", idempotencyKey: "retention-" + suffix,
        correlationId: "retention-operation-" + suffix,
        requestDigest: retentionDigest, actorId, auditEnvironment,
        payload: retentionPayload, payloadStore,
      });
      const retentionReference = {
        tenantId, applicationId, operationId: retentionQueued.operation.operationId,
        capabilityKey: "email.send", reference: retentionQueued.operation.payloadReference,
        digest: retentionDigest,
      };
      const retentionStore = new PostgresEncryptedProviderPayloadStore(pool, Buffer.alloc(32, 23), {
        async authorize() { return true; },
        async authorizeCreate() { return true; },
        async authorizeDelete() {
          return {
            actorType: "system", actorId: "retention-test-worker",
            source: "job", environment: "sandbox",
            reasonCode: "RETENTION_POLICY_EXPIRED",
            policyDecisionReference: "retention-decision-" + suffix,
            correlationId: "retention-correlation-" + suffix,
          };
        },
      });
      await pool.query(
        `UPDATE eper_provider_payloads
         SET expires_at=NOW()-INTERVAL '1 second',
             retention_policy_id='test-retention',retention_policy_version='1'
         WHERE payload_reference=$1`,
        [retentionReference.reference],
      );
      await assert.rejects(
        () => retentionStore.delete(retentionReference),
        error => error?.code === "PROVIDER_PAYLOAD_OPERATION_NOT_TERMINAL",
        "queued operations must retain their payload envelope",
      );
      await pool.query(
        "UPDATE eper_provider_operations SET operation_status='SUCCEEDED' WHERE tenant_id=$1 AND application_id=$2 AND operation_id=$3",
        [tenantId, applicationId, retentionReference.operationId],
      );
      assert.equal(await retentionStore.delete(retentionReference), true);
      assert.equal(await retentionStore.delete(retentionReference), false,
        "tombstoning must be idempotent");
      const tombstone = await pool.query(
        `SELECT payload_reference,payload_digest,nonce,auth_tag,ciphertext,deleted_at,
                deleted_by_actor_id,deletion_policy_decision_reference
         FROM eper_provider_payloads WHERE payload_reference=$1`,
        [retentionReference.reference],
      );
      assert.equal(tombstone.rowCount, 1);
      assert.equal(tombstone.rows[0].payload_reference, retentionReference.reference);
      assert.equal(tombstone.rows[0].payload_digest, retentionReference.digest);
      assert.equal(tombstone.rows[0].nonce, null);
      assert.equal(tombstone.rows[0].auth_tag, null);
      assert.equal(tombstone.rows[0].ciphertext, null);
      assert.ok(tombstone.rows[0].deleted_at);
      assert.equal(tombstone.rows[0].deleted_by_actor_id, "retention-test-worker");
      assert.equal(tombstone.rows[0].deletion_policy_decision_reference, "retention-decision-" + suffix);
      const operationAfterTombstone = await pool.query(
        "SELECT payload_reference FROM eper_provider_operations WHERE tenant_id=$1 AND application_id=$2 AND operation_id=$3",
        [tenantId, applicationId, retentionReference.operationId],
      );
      assert.equal(operationAfterTombstone.rows[0].payload_reference, retentionReference.reference,
        "operation-to-payload identity must survive ciphertext scrubbing");
      await assert.rejects(
        () => retentionStore.get(retentionReference),
        error => error?.code === "PROVIDER_PAYLOAD_DELETED",
      );

      // Verify every non-terminal state blocks tombstoning and every other
      // terminal state permits it. Each fixture is a real reciprocal queue/payload pair.
      for (const status of ["DISPATCHING", "RETRYING"]) {
        const payload = { body: "retention-blocked-" + status + "-" + suffix };
        const digest = createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
        const queued = await operationRepository.enqueueWithPayload({
          ...atomicInput,
          idempotencyKey: "retention-blocked-" + status + "-" + suffix,
          correlationId: "retention-blocked-" + status + "-correlation-" + suffix,
          requestDigest: digest,
          payload,
        });
        const reference = {
          tenantId, applicationId, operationId: queued.operation.operationId,
          capabilityKey: "email.send", reference: queued.operation.payloadReference, digest,
        };
        await pool.query(
          `UPDATE eper_provider_payloads
           SET expires_at=NOW()-INTERVAL '1 second',
               retention_policy_id='test-retention',retention_policy_version='1'
           WHERE payload_reference=$1`,
          [reference.reference],
        );
        await pool.query(
          `UPDATE eper_provider_operations
           SET operation_status=$4,
               lease_owner=CASE WHEN $4='DISPATCHING' THEN 'retention-test-worker' ELSE NULL END,
               lease_expires_at=CASE WHEN $4='DISPATCHING' THEN NOW()+INTERVAL '1 minute' ELSE NULL END,
               fencing_token=CASE WHEN $4='DISPATCHING' THEN 1 ELSE fencing_token END
           WHERE tenant_id=$1 AND application_id=$2 AND operation_id=$3`,
          [tenantId, applicationId, reference.operationId, status],
        );
        await assert.rejects(
          () => retentionStore.delete(reference),
          error => error?.code === "PROVIDER_PAYLOAD_OPERATION_NOT_TERMINAL",
          status + " operations must retain their payload envelope",
        );
      }

      for (const status of ["FAILED", "NEEDS_ATTENTION", "CANCELLED"]) {
        const payload = { body: "retention-terminal-" + status + "-" + suffix };
        const digest = createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
        const queued = await operationRepository.enqueueWithPayload({
          ...atomicInput,
          idempotencyKey: "retention-terminal-" + status + "-" + suffix,
          correlationId: "retention-terminal-" + status + "-correlation-" + suffix,
          requestDigest: digest,
          payload,
        });
        const reference = {
          tenantId, applicationId, operationId: queued.operation.operationId,
          capabilityKey: "email.send", reference: queued.operation.payloadReference, digest,
        };
        await pool.query(
          `UPDATE eper_provider_payloads
           SET expires_at=NOW()-INTERVAL '1 second',
               retention_policy_id='test-retention',retention_policy_version='1'
           WHERE payload_reference=$1`,
          [reference.reference],
        );
        await pool.query(
          `UPDATE eper_provider_operations
           SET operation_status=$4,lease_owner=NULL,lease_expires_at=NULL
           WHERE tenant_id=$1 AND application_id=$2 AND operation_id=$3`,
          [tenantId, applicationId, reference.operationId, status],
        );
        assert.equal(await retentionStore.delete(reference), true,
          status + " operations must permit eligible payload tombstoning");
      }

      // An audit insert failure must roll back the tombstone update atomically.
      const rollbackPayload = { body: "retention-audit-rollback-" + suffix };
      const rollbackDigest = createHash("sha256")
        .update(JSON.stringify(rollbackPayload), "utf8").digest("hex");
      const rollbackQueued = await operationRepository.enqueueWithPayload({
        ...atomicInput,
        idempotencyKey: "retention-audit-rollback-" + suffix,
        correlationId: "retention-audit-rollback-correlation-" + suffix,
        requestDigest: rollbackDigest,
        payload: rollbackPayload,
      });
      const rollbackReference = {
        tenantId, applicationId, operationId: rollbackQueued.operation.operationId,
        capabilityKey: "email.send", reference: rollbackQueued.operation.payloadReference,
        digest: rollbackDigest,
      };
      await pool.query(
        `UPDATE eper_provider_payloads
         SET expires_at=NOW()-INTERVAL '1 second',
             retention_policy_id='test-retention',retention_policy_version='1'
         WHERE payload_reference=$1`,
        [rollbackReference.reference],
      );
      await pool.query(
        `UPDATE eper_provider_operations
         SET operation_status='SUCCEEDED',lease_owner=NULL,lease_expires_at=NULL
         WHERE tenant_id=$1 AND application_id=$2 AND operation_id=$3`,
        [tenantId, applicationId, rollbackReference.operationId],
      );
      const invalidAuditStore = new PostgresEncryptedProviderPayloadStore(
        pool, Buffer.alloc(32, 23), {
          async authorize() { return true; },
          async authorizeCreate() { return true; },
          async authorizeDelete() {
            return {
              actorType: "system", actorId: "retention-test-worker", source: "job",
              environment: "invalid-environment", reasonCode: "RETENTION_POLICY_EXPIRED",
              policyDecisionReference: "rollback-decision-" + suffix,
              correlationId: "rollback-correlation-" + suffix,
            };
          },
        },
      );
      await assert.rejects(
        () => invalidAuditStore.delete(rollbackReference),
        error => error?.code === "23514",
        "invalid audit evidence must fail the transaction",
      );
      const rolledBackEnvelope = await pool.query(
        `SELECT nonce,auth_tag,ciphertext,deleted_at
         FROM eper_provider_payloads WHERE payload_reference=$1`,
        [rollbackReference.reference],
      );
      assert.equal(rolledBackEnvelope.rowCount, 1);
      assert.ok(rolledBackEnvelope.rows[0].nonce,
        "failed audit append must preserve the encrypted nonce");
      assert.ok(rolledBackEnvelope.rows[0].auth_tag,
        "failed audit append must preserve the authentication tag");
      assert.ok(rolledBackEnvelope.rows[0].ciphertext,
        "failed audit append must preserve ciphertext");
      assert.equal(rolledBackEnvelope.rows[0].deleted_at, null,
        "failed audit append must roll back tombstone metadata");

      // Exercise PostgreSQL RLS through the actual restricted NOLOGIN role.
      // The payload is created by enqueueWithPayload above, so it satisfies the
      // operation/payload deferred foreign keys introduced by migration 022.
      const roleClient = await pool.connect();
      try {
        await roleClient.query("BEGIN");
        await roleClient.query("SET LOCAL ROLE eper_provider_catalogue_access");
        await roleClient.query("SELECT set_config('eper.tenant_id',$1,true)", [tenantId]);
        await roleClient.query("SELECT set_config('eper.application_id',$1,true)", [applicationId]);
        const allowedRow = await roleClient.query(
          "SELECT payload_reference FROM eper_provider_payloads WHERE payload_reference=$1",
          [exactPayloadReference.reference],
        );
        assert.equal(allowedRow.rowCount, 1,
          "restricted provider role must read payloads in the active tenant/application scope");

        await roleClient.query("SELECT set_config('eper.tenant_id',$1,true)", ["other-tenant-" + suffix]);
        const crossTenantRead = await roleClient.query(
          "SELECT payload_reference FROM eper_provider_payloads WHERE payload_reference=$1",
          [exactPayloadReference.reference],
        );
        assert.equal(crossTenantRead.rowCount, 0, "RLS must hide payload rows outside the active tenant");

        await roleClient.query("SELECT set_config('eper.tenant_id',$1,true)", [tenantId]);
        await roleClient.query("SELECT set_config('eper.application_id',$1,true)", ["other-application-" + suffix]);
        const crossApplicationRead = await roleClient.query(
          "SELECT payload_reference FROM eper_provider_payloads WHERE payload_reference=$1",
          [exactPayloadReference.reference],
        );
        assert.equal(crossApplicationRead.rowCount, 0,
          "RLS must hide payload rows outside the active application");

        await roleClient.query("SELECT set_config('eper.tenant_id',$1,true)", ["other-tenant-" + suffix]);
        await assert.rejects(
          () => roleClient.query(
            `INSERT INTO eper_provider_payloads
              (payload_reference,tenant_id,application_id,operation_id,capability_key,
               payload_digest,envelope_version,nonce,auth_tag,ciphertext)
             VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9)`,
            ["pp_" + randomUUID(), "other-tenant-" + suffix, applicationId,
              randomUUID(), "email.send", "a".repeat(64),
              "AAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBB", "YQ=="],
          ),
          error => error && error.code === "42501",
          "RLS WITH CHECK must reject writes under an unauthorized tenant context",
        );
        await roleClient.query("ROLLBACK");
      } catch (error) {
        await roleClient.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        roleClient.release();
      }

      let scopedAccess = true;
      const scopedPayloadStore = new PostgresEncryptedProviderPayloadStore(
        pool, Buffer.alloc(32, 23), {
          async authorize(requested) {
            return scopedAccess && requested.tenantId === tenantId
              && requested.applicationId === applicationId
              && requested.operationId === atomicFirst.operation.operationId
              && requested.capabilityKey === "email.send";
          },
          async authorizeCreate(requested) {
            return scopedAccess && requested.tenantId === tenantId
              && requested.applicationId === applicationId
              && requested.capabilityKey === "email.send";
          },
          async authorizeDelete(requested) {
            return scopedAccess && requested.tenantId === tenantId
              && requested.applicationId === applicationId
              && requested.operationId === atomicFirst.operation.operationId
              ? { actorType: "system", actorId: "test-retention-worker", source: "job",
                  environment: auditEnvironment, reasonCode: "RETENTION_EXPIRED",
                  policyDecisionReference: "test-policy-" + suffix,
                  correlationId: "test-correlation-" + suffix }
              : null;
          },
        },
      );
      assert.deepEqual(await scopedPayloadStore.get(exactPayloadReference), providerPayload);
      await assert.rejects(
        () => scopedPayloadStore.get({ ...exactPayloadReference, applicationId: applicationId + "-other" }),
        error => error?.code === "PROVIDER_PAYLOAD_ACCESS_DENIED",
      );
      scopedAccess = false;
      await assert.rejects(
        () => scopedPayloadStore.get(exactPayloadReference),
        error => error?.code === "PROVIDER_PAYLOAD_ACCESS_DENIED",
      );
      await assert.rejects(
        () => scopedPayloadStore.put({
          tenantId, applicationId, operationId: randomUUID(), capabilityKey: "email.send",
          payload: { body: "must-not-persist-without-create-authorization" },
        }),
        error => error?.code === "PROVIDER_PAYLOAD_ACCESS_DENIED",
      );
      await assert.rejects(
        () => scopedPayloadStore.delete(exactPayloadReference),
        error => error?.code === "PROVIDER_PAYLOAD_ACCESS_DENIED",
      );
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

      const danglingPayload = { to: ["synthetic@example.invalid"], body: "dangling-" + suffix };
      const danglingDigest = createHash("sha256")
        .update(JSON.stringify(danglingPayload), "utf8").digest("hex");
      const danglingReference = "pp_" + randomUUID();
      await assert.rejects(
        () => operationRepository.enqueueWithPayload({
          ...atomicInput,
          idempotencyKey: "dangling-" + suffix,
          correlationId: "dangling-correlation-" + suffix,
          requestDigest: danglingDigest,
          payload: danglingPayload,
          payloadStore: {
            async putInTransaction() {
              return { reference: danglingReference, digest: danglingDigest };
            },
          },
        }),
        error => error?.code === "23503"
          && error?.constraint === "eper_provider_operations_payload_fk",
        "the deferred reverse FK must reject an operation that references no payload envelope",
      );
      const danglingOperation = await pool.query(
        "SELECT COUNT(*)::int AS count FROM eper_provider_operations WHERE tenant_id=$1 AND application_id=$2 AND idempotency_key=$3",
        [tenantId, applicationId, "dangling-" + suffix],
      );
      assert.equal(danglingOperation.rows[0].count, 0,
        "the failed operation transaction must not leave a dangling queue row");

      // Retention tombstone behavior is covered above with a dedicated
      // operation/payload fixture, including terminal-state and traceability checks.


      // Prove PostgreSQL-backed v2 key rotation using operation-backed enqueue.
      // The deferred payload/operation FKs prohibit payload-only store.put()
      // fixtures, so each envelope is committed with its matching queue row.
      const keyA = Buffer.alloc(32, 41);
      const keyB = Buffer.alloc(32, 42);
      const keyringA = {
        legacyV1Key: Buffer.alloc(32, 23),
        activeWriteKeyId: "payload-key-a",
        keys: new Map([["payload-key-a", keyA]]),
      };
      const keyringB = {
        legacyV1Key: Buffer.alloc(32, 23),
        activeWriteKeyId: "payload-key-b",
        keys: new Map([["payload-key-a", keyA], ["payload-key-b", keyB]]),
      };
      const keyringAuthorization = {
        async authorize() { return true; },
        async authorizeCreate() { return true; },
      };
      const keyringStoreA = new PostgresEncryptedProviderPayloadStore(
        pool, keyringA, keyringAuthorization,
      );
      const keyringPayload = {
        to: ["synthetic@example.invalid"],
        body: "keyring-before-rotation-" + suffix,
      };
      const keyringDigest = createHash("sha256")
        .update(JSON.stringify(keyringPayload), "utf8").digest("hex");
      const keyringFirst = await operationRepository.enqueueWithPayload({
        tenantId, applicationId, connectionId, capabilityKey: "email.send",
        capabilityVersion: "1", idempotencyKey: "keyring-a-" + suffix,
        correlationId: "keyring-a-correlation-" + suffix,
        requestDigest: keyringDigest, actorId, auditEnvironment,
        payload: keyringPayload, payloadStore: keyringStoreA,
      });
      assert.equal(keyringFirst.created, true);
      const keyringReference = {
        tenantId, applicationId,
        operationId: keyringFirst.operation.operationId,
        capabilityKey: "email.send",
        reference: keyringFirst.operation.payloadReference,
        digest: keyringDigest,
      };
      const keyringRowA = await pool.query(
        "SELECT envelope_version,key_id FROM eper_provider_payloads WHERE payload_reference=$1",
        [keyringReference.reference],
      );
      assert.equal(keyringRowA.rowCount, 1);
      assert.equal(keyringRowA.rows[0].envelope_version, 2);
      assert.equal(keyringRowA.rows[0].key_id, "payload-key-a");

      const keyringStoreB = new PostgresEncryptedProviderPayloadStore(
        pool, keyringB, keyringAuthorization,
      );
      assert.deepEqual(await keyringStoreB.get(keyringReference), keyringPayload,
        "the retiring read key must decrypt existing v2 rows after active-key rotation");

      const rotatedPayload = { body: "keyring-after-rotation-" + suffix };
      const rotatedDigest = createHash("sha256")
        .update(JSON.stringify(rotatedPayload), "utf8").digest("hex");
      const rotated = await operationRepository.enqueueWithPayload({
        tenantId, applicationId, connectionId, capabilityKey: "email.send",
        capabilityVersion: "1", idempotencyKey: "keyring-b-" + suffix,
        correlationId: "keyring-b-correlation-" + suffix,
        requestDigest: rotatedDigest, actorId, auditEnvironment,
        payload: rotatedPayload, payloadStore: keyringStoreB,
      });
      assert.equal(rotated.created, true);
      const rotatedReference = {
        tenantId, applicationId,
        operationId: rotated.operation.operationId,
        capabilityKey: "email.send",
        reference: rotated.operation.payloadReference,
        digest: rotatedDigest,
      };
      const keyringRowB = await pool.query(
        "SELECT envelope_version,key_id FROM eper_provider_payloads WHERE payload_reference=$1",
        [rotatedReference.reference],
      );
      assert.equal(keyringRowB.rowCount, 1);
      assert.equal(keyringRowB.rows[0].envelope_version, 2);
      assert.equal(keyringRowB.rows[0].key_id, "payload-key-b");
      assert.deepEqual(await keyringStoreB.get(rotatedReference), rotatedPayload);

      const retiredKeyUnavailable = new PostgresEncryptedProviderPayloadStore(pool, {
        legacyV1Key: Buffer.alloc(32, 23),
        activeWriteKeyId: "payload-key-b",
        keys: new Map([["payload-key-b", keyB]]),
      }, keyringAuthorization);
      await assert.rejects(
        () => retiredKeyUnavailable.get(keyringReference),
        error => error?.code === "PROVIDER_PAYLOAD_DECRYPTION_FAILED",
        "removing a still-referenced key must fail closed rather than return plaintext",
      );
    } finally {
      const cleanup = await pool.connect();
      try {
        await cleanup.query("BEGIN");
        await cleanup.query("SET CONSTRAINTS ALL DEFERRED");
        if (connectionId) {
          await cleanup.query(
            "DELETE FROM eper_provider_operations WHERE tenant_id=$1 AND application_id=$2",
            [tenantId, applicationId],
          );
          await cleanup.query(
            "DELETE FROM eper_provider_payloads WHERE tenant_id=$1 AND application_id=$2",
            [tenantId, applicationId],
          );
          await cleanup.query(
            "DELETE FROM eper_provider_connection_applications WHERE tenant_id=$1 AND application_id=$2",
            [tenantId, applicationId],
          );
          await cleanup.query(
            "DELETE FROM eper_provider_connections WHERE tenant_id=$1 AND connection_id=$2",
            [tenantId, connectionId],
          );
        }
        await cleanup.query("DELETE FROM eper_provider_definitions WHERE provider_key=$1", [providerKey]);
        await cleanup.query("COMMIT");
      } catch {
        await cleanup.query("ROLLBACK").catch(() => undefined);
      } finally {
        cleanup.release();
        await pool.end();
      }
    }
  });
