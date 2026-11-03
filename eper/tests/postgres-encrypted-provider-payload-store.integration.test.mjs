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
        "SELECT payload_digest,envelope_version,nonce,auth_tag,ciphertext FROM eper_provider_payloads WHERE payload_reference=$1",
        [reference.reference],
      );
      assert.equal(persisted.rowCount, 1);
      assert.equal(persisted.rows[0].envelope_version, 1);
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
      assert.equal(await store.delete(reference), true);
      assert.equal(await store.delete(reference), false);
    } finally {
      await pool.query(
        "DELETE FROM eper_provider_payloads WHERE tenant_id=$1 AND application_id=$2",
        [scope.tenantId, scope.applicationId],
      ).catch(() => undefined);
      await pool.end();
    }
  });
