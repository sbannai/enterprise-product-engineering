import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresCustomerAssetRepository } from "../dist/packages/assets/postgres-customer-asset-repository.js";

const connectionString = process.env.DATABASE_URL;
test("live PostgreSQL expiry is tenant-bound, cross-application, audited and exactly-once under competing workers",
  { skip: !connectionString || process.env.EPER_CUSTOMER_ASSET_LIVE_TESTS !== "1" }, async () => {
    const pool = new pg.Pool({ connectionString, max: 8 });
    const suffix = randomUUID().replaceAll("-", "");
    const tenantId = "asset-expiry-tenant-" + suffix.slice(0, 18);
    const otherTenantId = "asset-expiry-other-" + suffix.slice(0, 16);
    const appA = "asset-expiry-app-a-" + suffix.slice(0, 12);
    const appB = "asset-expiry-app-b-" + suffix.slice(0, 12);
    const actorId = "asset-expiry-actor-" + suffix.slice(0, 12);
    const repository = new PostgresCustomerAssetRepository(pool);
    const sessions = [];

    try {
      await pool.query(
        "INSERT INTO public.eper_customer_asset_upload_expiry_worker_tenant_scope(login_role, tenant_id, enabled) VALUES (session_user, $1, true)",
        [tenantId],
      );
      await repository.assertReady();
      for (const [applicationId, label] of [[appA, "a"], [appB, "b"]]) {
        const assetId = randomUUID();
        const correlationId = "asset-expiry-" + label + "-" + suffix;
        await repository.create({
          tenantId, applicationId, actorId, environment: "sandbox", correlationId,
          assetId, scope: "application_restricted", ownerApplicationId: applicationId,
          displayName: "Expiry integration fixture " + label, originalFileName: "expiry.pdf",
          mediaCategory: "document", mimeType: "application/pdf", fileExtension: "pdf",
          sizeBytes: 1024, storageAdapterKey: "ci-storage",
          storageObjectReference: "opaque-expiry-object-" + suffix + "-" + label,
        });
        const reservation = await repository.reserveUpload({
          tenantId, applicationId, actorId, environment: "sandbox", correlationId,
          assetId, expectedSizeBytes: 1024, idempotencyKey: "expiry-" + label + "-" + suffix.slice(0, 24),
          requestFingerprint: "a".repeat(64 - label.length) + label,
        });
        sessions.push({ applicationId, assetId, uploadSessionId: reservation.uploadSessionId });
      }

      // Exercise reserved independently from the initiated lifecycle state.
      await pool.query(
        "UPDATE eper_customer_asset_upload_sessions SET upload_status = 'reserved' WHERE tenant_id = $1 AND upload_session_id = $2",
        [tenantId, sessions[0].uploadSessionId],
      );
      await pool.query(
        "UPDATE eper_customer_asset_upload_sessions SET expires_at = now() - interval '2 minutes' WHERE tenant_id = $1 AND upload_session_id = ANY($2::uuid[])",
        [tenantId, sessions.map(row => row.uploadSessionId)],
      );

      const [first, second] = await Promise.all([
        repository.expireStaleUploadSessions({
          tenantId, applicationId: appA, environment: "sandbox",
          correlationId: "expiry-worker-a-" + suffix, limit: 10,
        }),
        repository.expireStaleUploadSessions({
          tenantId, applicationId: appB, environment: "sandbox",
          correlationId: "expiry-worker-b-" + suffix, limit: 10,
        }),
      ]);
      assert.equal(first + second, 2,
        "competing workers must collectively expire each stale session exactly once");

      const persisted = await pool.query(
        "SELECT application_id, upload_session_id, upload_status FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1 AND upload_session_id = ANY($2::uuid[]) ORDER BY application_id",
        [tenantId, sessions.map(row => row.uploadSessionId)],
      );
      assert.equal(persisted.rowCount, 2);
      assert.ok(persisted.rows.every(row => row.upload_status === "expired"));

      const audit = await pool.query(
        "SELECT application_id, resource_id, action, outcome FROM eper_audit_events WHERE tenant_id = $1 AND action = 'customer.asset.upload.expire' AND resource_id = ANY($2::text[])",
        [tenantId, sessions.map(row => row.uploadSessionId)],
      );
      assert.equal(audit.rowCount, 2, "each expiry transition must append one durable audit event");
      for (const session of sessions) {
        assert.equal(audit.rows.filter(row =>
          row.application_id === session.applicationId &&
          row.resource_id === session.uploadSessionId &&
          row.outcome === "success").length, 1,
        "expiry audit must be recorded under the owning application context");
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
        await client.query("SELECT set_config('eper.application_id', $1, true)", [appA]);
        await assert.rejects(
          client.query("SELECT * FROM public.eper_expire_customer_asset_upload_sessions($1, $2)", [otherTenantId, 5]),
          /EPER_CUSTOMER_ASSET_EXPIRY_WORKER_SCOPE_DENIED/,
          "a caller cannot use a tenant-bound expiry function for another tenant",
        );
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    } finally {
      await pool.query("DELETE FROM public.eper_customer_asset_upload_expiry_worker_tenant_scope WHERE login_role = session_user AND tenant_id = $1", [tenantId]).catch(() => {});
      await pool.query("DELETE FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1", [tenantId]).catch(() => {});
      await pool.query("DELETE FROM eper_customer_asset_metadata_operations WHERE tenant_id = $1", [tenantId]).catch(() => {});
      await pool.query("DELETE FROM eper_customer_assets WHERE tenant_id = $1", [tenantId]).catch(() => {});
      await pool.end();
    }
  });


test("actual expiry worker LOGIN is confined to operator-registered tenants despite forged tenant GUCs", {
  skip: !connectionString || process.env.EPER_CUSTOMER_ASSET_LIVE_TESTS !== "1",
}, async () => {
  const admin = new pg.Pool({ connectionString, max: 2 });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
  const loginRole = "eper_expiry_scope_" + suffix;
  const password = randomUUID() + randomUUID();
  const tenantA = "expiry-scope-a-" + suffix;
  const tenantB = "expiry-scope-b-" + suffix;
  let worker;
  try {
    await admin.query(`CREATE ROLE "${loginRole}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS`);
    await admin.query(`GRANT CONNECT ON DATABASE ${(await admin.query("SELECT current_database() AS name")).rows[0].name.replace(/[^a-zA-Z0-9_]/g, "")} TO "${loginRole}"`);
    await admin.query(`GRANT eper_customer_asset_upload_expiry_worker_access TO "${loginRole}"`);
    await admin.query(
      "INSERT INTO public.eper_customer_asset_upload_expiry_worker_tenant_scope(login_role, tenant_id, enabled) VALUES ($1, $2, true)",
      [loginRole, tenantA],
    );

    const parsed = new URL(connectionString);
    parsed.username = loginRole;
    parsed.password = password;
    worker = new pg.Pool({ connectionString: parsed.toString(), max: 1, connectionTimeoutMillis: 5000 });
    const client = await worker.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantA]);
      assert.equal((await client.query(
        "SELECT count(*)::int AS n FROM public.eper_expire_customer_asset_upload_sessions($1, 5)",
        [tenantA],
      )).rows[0].n, 0);
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantB]);
      await client.query("SAVEPOINT deny_other_tenant");
      await assert.rejects(
        client.query("SELECT * FROM public.eper_expire_customer_asset_upload_sessions($1, 5)", [tenantB]),
        /EPER_CUSTOMER_ASSET_EXPIRY_WORKER_SCOPE_DENIED/,
      );
      await client.query("ROLLBACK TO SAVEPOINT deny_other_tenant");
      await client.query("SAVEPOINT deny_registry_read");
      await assert.rejects(
        client.query("SELECT * FROM public.eper_customer_asset_upload_expiry_worker_tenant_scope"),
        /permission denied/i,
      );
      await client.query("ROLLBACK TO SAVEPOINT deny_registry_read");
      await client.query("SAVEPOINT deny_registry_write");
      await assert.rejects(
        client.query("INSERT INTO public.eper_customer_asset_upload_expiry_worker_tenant_scope(login_role, tenant_id) VALUES ($1, $2)", [loginRole, tenantB]),
        /permission denied/i,
      );
      await client.query("ROLLBACK TO SAVEPOINT deny_registry_write");
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    await admin.query(
      "UPDATE public.eper_customer_asset_upload_expiry_worker_tenant_scope SET enabled = false WHERE login_role = $1 AND tenant_id = $2",
      [loginRole, tenantA],
    );
    const revoked = await worker.connect();
    try {
      await revoked.query("BEGIN");
      await revoked.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantA]);
      await assert.rejects(
        revoked.query("SELECT * FROM public.eper_expire_customer_asset_upload_sessions($1, 5)", [tenantA]),
        /EPER_CUSTOMER_ASSET_EXPIRY_WORKER_SCOPE_DENIED/,
      );
      await revoked.query("ROLLBACK");
    } finally {
      revoked.release();
    }
  } finally {
    await worker?.end();
    await admin.query("DELETE FROM public.eper_customer_asset_upload_expiry_worker_tenant_scope WHERE login_role = $1", [loginRole]).catch(() => {});
    await admin.query(`REVOKE eper_customer_asset_upload_expiry_worker_access FROM "${loginRole}"`).catch(() => {});
    await admin.query(`REVOKE CONNECT ON DATABASE eper_test FROM "${loginRole}"`).catch(() => {});
    await admin.query(`DROP ROLE IF EXISTS "${loginRole}"`).catch(() => {});
    await admin.end();
  }
});
