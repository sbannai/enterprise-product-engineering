import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  PostgresEncryptedProviderPayloadStore,
} from "../dist/packages/integrations/postgres-encrypted-provider-payload-store.js";
import { ProviderPayloadStoreError } from "../dist/packages/integrations/encrypted-provider-payload-store.js";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

test("PostgreSQL encrypted provider payloads persist ciphertext and enforce exact scope authorization",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 4 });
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const scope = {
      tenantId: "payload-tenant-" + suffix,
      applicationId: "payload-app-" + suffix,
      operationId: "payload-operation-" + suffix,
      capabilityKey: "email.send",
    };
    const secretText = "synthetic-private-body-" + suffix;
    let permitted = true;
    const store = new PostgresEncryptedProviderPayloadStore(
      pool,
      Buffer.alloc(32, 19),
      { async authorize(requested) {
        assert.deepEqual(requested, scope);
        return permitted;
      }, async authorizeCreate(requested) {
        assert.deepEqual(requested, scope);
        return permitted;
      }, async authorizeDelete(requested) {
        assert.deepEqual(requested, scope);
        return permitted ? {
          actorType: "system",
          actorId: "test-retention-worker",
          source: "job",
          environment: "sandbox",
          reasonCode: "RETENTION_EXPIRED",
          policyDecisionReference: "test-policy-decision-" + suffix,
          correlationId: "test-correlation-" + suffix,
        } : null;
      } },
    );

    try {
      const reference = await store.put({
        ...scope,
        payload: { to: ["synthetic@example.invalid"], body: secretText },
      });
      assert.match(reference.reference, /^pp_[a-f0-9-]{36}$/);
      assert.match(reference.digest, /^[a-f0-9]{64}$/);

      const persisted = await pool.query(
        "SELECT payload_digest,envelope_version,key_id,expires_at,legal_hold,retention_policy_id,retention_policy_version,nonce,auth_tag,ciphertext FROM eper_provider_payloads WHERE payload_reference=$1",
        [reference.reference],
      );
      assert.equal(persisted.rowCount, 1);
      assert.equal(persisted.rows[0].envelope_version, 1);
      assert.equal(persisted.rows[0].key_id, null, "legacy v1 envelopes remain explicitly key-id-free");
      assert.equal(persisted.rows[0].expires_at, null, "unresolved retention policy must not invent an expiry");
      assert.equal(persisted.rows[0].legal_hold, false);
      assert.equal(persisted.rows[0].retention_policy_id, null);
      assert.equal(persisted.rows[0].retention_policy_version, null);
      await assert.rejects(
        () => pool.query(
          "UPDATE eper_provider_payloads SET retention_policy_id=$2 WHERE payload_reference=$1",
          [reference.reference, "policy-without-version"],
        ),
        error => error && error.code === "23514",
        "retention policy identifier and version must be stored together",
      );
      assert.ok(persisted.rows[0].ciphertext.length > 0);
      assert.equal(JSON.stringify(persisted.rows[0]).includes(secretText), false,
        "database envelope must not contain plaintext payload values");

      // Exercise PostgreSQL RLS and the actual restricted service role, not only
      // the application authorization callback above. The CI migration user is
      // privileged and can SET ROLE to the NOLOGIN group role.
      const roleClient = await pool.connect();
      try {
        await roleClient.query("BEGIN");
        await roleClient.query("SET LOCAL ROLE eper_provider_catalogue_access");
        await roleClient.query("SELECT set_config('eper.tenant_id',$1,true)", [scope.tenantId]);
        await roleClient.query("SELECT set_config('eper.application_id',$1,true)", [scope.applicationId]);
        const allowedRow = await roleClient.query(
          "SELECT payload_reference FROM eper_provider_payloads WHERE payload_reference=$1",
          [reference.reference],
        );
        assert.equal(allowedRow.rowCount, 1,
          "restricted provider role must read payloads in the active tenant/application scope");

        await roleClient.query("SELECT set_config('eper.tenant_id',$1,true)", ["other-tenant-" + suffix]);
        const crossTenantRead = await roleClient.query(
          "SELECT payload_reference FROM eper_provider_payloads WHERE payload_reference=$1",
          [reference.reference],
        );
        assert.equal(crossTenantRead.rowCount, 0,
          "RLS must hide payload rows outside the active tenant");

        await roleClient.query("SELECT set_config('eper.tenant_id',$1,true)", [scope.tenantId]);
        await roleClient.query("SELECT set_config('eper.application_id',$1,true)", ["other-application-" + suffix]);
        const crossApplicationRead = await roleClient.query(
          "SELECT payload_reference FROM eper_provider_payloads WHERE payload_reference=$1",
          [reference.reference],
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
            ["pp_" + randomUUID(), "other-tenant-" + suffix, scope.applicationId,
              "unauthorized-" + suffix, scope.capabilityKey, "a".repeat(64),
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

      assert.deepEqual(await store.get(reference), {
        to: ["synthetic@example.invalid"], body: secretText,
      });

      await assert.rejects(
        () => store.get({ ...reference, applicationId: "another-application" }),
        error => error instanceof ProviderPayloadStoreError
          && error.code === "PROVIDER_PAYLOAD_ACCESS_DENIED",
      );

      permitted = false;
      await assert.rejects(
        () => store.put({ ...scope, payload: { body: "must-not-persist" } }),
        error => error instanceof ProviderPayloadStoreError
          && error.code === "PROVIDER_PAYLOAD_ACCESS_DENIED",
      );
      await assert.rejects(
        () => store.get(reference),
        error => error instanceof ProviderPayloadStoreError
          && error.code === "PROVIDER_PAYLOAD_ACCESS_DENIED",
      );
      await assert.rejects(
        () => store.delete(reference),
        error => error instanceof ProviderPayloadStoreError
          && error.code === "PROVIDER_PAYLOAD_ACCESS_DENIED",
      );

      permitted = true;
      await pool.query(
        `UPDATE eper_provider_payloads
         SET expires_at=NOW() - INTERVAL '1 minute',
             retention_policy_id='test-retention-policy',
             retention_policy_version='1'
         WHERE payload_reference=$1`,
        [reference.reference],
      );
      await pool.query(
        "UPDATE eper_provider_payloads SET legal_hold=TRUE WHERE payload_reference=$1",
        [reference.reference],
      );
      await assert.rejects(
        () => store.delete(reference),
        error => error instanceof ProviderPayloadStoreError
          && error.code === "PROVIDER_PAYLOAD_LEGAL_HOLD_ACTIVE",
      );
      await pool.query(
        "UPDATE eper_provider_payloads SET legal_hold=FALSE WHERE payload_reference=$1",
        [reference.reference],
      );
      assert.equal(await store.delete(reference), true);
      assert.equal(await store.delete(reference), false);
      const deletionAudit = await pool.query(
        `SELECT actor_type,actor_id,action,outcome,resource_id,payload
         FROM eper_audit_events
         WHERE tenant_id=$1 AND application_id=$2 AND resource_id=$3
           AND action='provider.payload.deleted'`,
        [scope.tenantId, scope.applicationId, reference.reference],
      );
      assert.equal(deletionAudit.rowCount, 1, "payload deletion and audit must commit together");
      assert.equal(deletionAudit.rows[0].actor_type, "system");
      assert.equal(deletionAudit.rows[0].actor_id, "test-retention-worker");
      assert.equal(deletionAudit.rows[0].outcome, "success");
      assert.equal(deletionAudit.rows[0].resource_id, reference.reference);
    } finally {
      await pool.query(
        "DELETE FROM eper_provider_payloads WHERE tenant_id=$1 AND application_id=$2",
        [scope.tenantId, scope.applicationId],
      ).catch(() => undefined);
      await pool.end();
    }
  });


test("PostgreSQL payload store writes v2 with active key and reads retained keys after rotation",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 3 });
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const scope = {
      tenantId: "keyring-tenant-" + suffix,
      applicationId: "keyring-app-" + suffix,
      operationId: "keyring-operation-" + suffix,
      capabilityKey: "email.send",
    };
    const keyA = Buffer.alloc(32, 41);
    const keyB = Buffer.alloc(32, 42);
    const keyringA = {
      legacyV1Key: Buffer.alloc(32, 19),
      activeWriteKeyId: "payload-key-a",
      keys: new Map([["payload-key-a", keyA]]),
    };
    const keyringB = {
      legacyV1Key: Buffer.alloc(32, 19),
      activeWriteKeyId: "payload-key-b",
      keys: new Map([["payload-key-a", keyA], ["payload-key-b", keyB]]),
    };
    const authorization = {
      async authorize() { return true; },
      async authorizeCreate() { return true; },
    };
    try {
      const storeA = new PostgresEncryptedProviderPayloadStore(pool, keyringA, authorization);
      const reference = await storeA.put({ ...scope, payload: { body: "v2-persisted-payload" } });
      const row = await pool.query(
        "SELECT envelope_version,key_id FROM eper_provider_payloads WHERE payload_reference=$1",
        [reference.reference],
      );
      assert.equal(row.rows[0].envelope_version, 2);
      assert.equal(row.rows[0].key_id, "payload-key-a");
      const storeAfterRotation = new PostgresEncryptedProviderPayloadStore(pool, keyringB, authorization);
      assert.deepEqual(await storeAfterRotation.get(reference), { body: "v2-persisted-payload" });
      const rotatedReference = await storeAfterRotation.put({
        ...scope, operationId: scope.operationId + "-rotated",
        payload: { body: "new-active-key" },
      });
      const rotatedRow = await pool.query(
        "SELECT envelope_version,key_id FROM eper_provider_payloads WHERE payload_reference=$1",
        [rotatedReference.reference],
      );
      assert.equal(rotatedRow.rows[0].envelope_version, 2);
      assert.equal(rotatedRow.rows[0].key_id, "payload-key-b");
      assert.deepEqual(await storeAfterRotation.get(rotatedReference), { body: "new-active-key" });
      await assert.rejects(
        () => new PostgresEncryptedProviderPayloadStore(pool, {
          legacyV1Key: Buffer.alloc(32, 19),
          activeWriteKeyId: "payload-key-b",
          keys: new Map([["payload-key-b", keyB]]),
        }, authorization).get(reference),
        error => error instanceof ProviderPayloadStoreError
          && error.code === "PROVIDER_PAYLOAD_DECRYPTION_FAILED",
      );
    } finally {
      await pool.query(
        "DELETE FROM eper_provider_payloads WHERE tenant_id=$1 AND application_id=$2",
        [scope.tenantId, scope.applicationId],
      ).catch(() => undefined);
      await pool.end();
    }
  });
