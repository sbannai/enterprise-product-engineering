import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  PostgresEncryptedProviderPayloadStore,
} from "../dist/packages/integrations/postgres-encrypted-provider-payload-store.js";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

test("PostgreSQL payload store rejects non-UUID operation identities before insert",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 2 });
    const store = new PostgresEncryptedProviderPayloadStore(
      pool,
      Buffer.alloc(32, 19),
      {
        async authorize() { return true; },
        async authorizeCreate() { return true; },
      },
    );
    try {
      await assert.rejects(
        () => store.put({
          tenantId: "payload-invalid-tenant",
          applicationId: "payload-invalid-app",
          operationId: "not-a-uuid",
          capabilityKey: "email.send",
          payload: { body: "synthetic-invalid-operation-probe" },
        }),
        error => error?.code === "PROVIDER_PAYLOAD_SCOPE_INVALID",
      );
    } finally {
      await pool.end();
    }
  });

test("PostgreSQL rejects a provider payload committed without its matching operation",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 2 });
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const scope = {
      tenantId: "payload-orphan-tenant-" + suffix,
      applicationId: "payload-orphan-app-" + suffix,
      operationId: randomUUID(),
      capabilityKey: "email.send",
    };
    const store = new PostgresEncryptedProviderPayloadStore(
      pool,
      Buffer.alloc(32, 19),
      {
        async authorize() { return true; },
        async authorizeCreate() { return true; },
      },
    );

    try {
      await assert.rejects(
        () => store.put({ ...scope, payload: { body: "synthetic-orphan-probe" } }),
        error => error?.code === "23503"
          && error?.constraint === "eper_provider_payloads_operation_fk",
        "the deferred composite foreign key must reject an orphan at commit",
      );

      const persisted = await pool.query(
        "SELECT COUNT(*)::int AS count FROM eper_provider_payloads WHERE tenant_id=$1 AND application_id=$2",
        [scope.tenantId, scope.applicationId],
      );
      assert.equal(persisted.rows[0].count, 0,
        "the failed transaction must leave no orphan payload behind");
    } finally {
      await pool.end();
    }
  });
