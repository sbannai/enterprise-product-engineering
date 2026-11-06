import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

test("customer asset RLS blocks cross-tenant and cross-application access under runtime role",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 3 });
    const client = await pool.connect();
    const tenantA = "asset-rls-a-" + randomUUID();
    const tenantB = "asset-rls-b-" + randomUUID();
    const appA = "application-a";
    const appB = "application-b";
    const ids = {
      sharedUnlinked: randomUUID(),
      sharedLinkedB: randomUUID(),
      restrictedA: randomUUID(),
      restrictedB: randomUUID(),
      tenantBRestricted: randomUUID(),
      tenantBShared: randomUUID(),
    };
    const sessionIds = { appA: randomUUID(), appB: randomUUID(), tenantB: randomUUID() };

    const insertAsset = async (tenantId, assetId, scope, ownerApplicationId = null) => {
      await pool.query(
        `INSERT INTO eper_customer_assets (
          tenant_id, asset_id, repository_scope, owner_application_id,
          display_name, original_file_name, media_category, mime_type,
          file_extension, size_bytes, storage_adapter_key, storage_object_reference,
          created_by, updated_by
        ) VALUES ($1,$2,$3,$4,$5,'fixture.txt','document','text/plain','txt',16,
                  'test-adapter',$6,'rls-test','rls-test')`,
        [tenantId, assetId, scope, ownerApplicationId, "Fixture " + assetId, "opaque:" + assetId],
      );
    };

    const insertSession = async (tenantId, applicationId, uploadSessionId, assetId, key) => {
      await pool.query(
        `INSERT INTO eper_customer_asset_upload_sessions (
          tenant_id, application_id, upload_session_id, asset_id, actor_id,
          expected_size_bytes, idempotency_key, expires_at
        ) VALUES ($1,$2,$3,$4,'rls-test',16,$5,now() + interval '1 hour')`,
        [tenantId, applicationId, uploadSessionId, assetId, "rls-test-" + key + "-" + randomUUID()],
      );
    };

    const setContext = async (tenantId, applicationId) => {
      await client.query(
        "SELECT set_config('eper.tenant_id',$1,true), set_config('eper.application_id',$2,true)",
        [tenantId, applicationId],
      );
    };

    const expectRlsDenied = async (query, values) => {
      await client.query("SAVEPOINT expected_rls_denial");
      try {
        await assert.rejects(client.query(query, values), error => error.code === "42501");
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT expected_rls_denial");
        await client.query("RELEASE SAVEPOINT expected_rls_denial");
      }
    };

    try {
      // Seed fixtures as the disposable CI database owner before switching roles.
      await insertAsset(tenantA, ids.sharedUnlinked, "customer_shared");
      await insertAsset(tenantA, ids.sharedLinkedB, "customer_shared");
      await insertAsset(tenantA, ids.restrictedA, "application_restricted", appA);
      await insertAsset(tenantA, ids.restrictedB, "application_restricted", appB);
      await insertAsset(tenantB, ids.tenantBRestricted, "application_restricted", appA);
      await insertAsset(tenantB, ids.tenantBShared, "customer_shared");

      await pool.query(
        `INSERT INTO eper_customer_asset_application_links (
          tenant_id, application_id, asset_id, linked_by, link_reason, idempotency_key
        ) VALUES ($1,$2,$3,'rls-test','explicit-share',$4)`,
        [tenantA, appB, ids.sharedLinkedB, "rls-link-" + randomUUID()],
      );
      await pool.query(
        "INSERT INTO eper_customer_asset_application_links (tenant_id, application_id, asset_id, linked_by, link_reason, idempotency_key) VALUES ($1,$2,$3,'rls-test','tenant-b-fixture',$4)",
        [tenantB, appA, ids.tenantBShared, "rls-link-" + randomUUID()],
      );
      await insertSession(tenantA, appA, sessionIds.appA, ids.restrictedA, "app-a");
      await insertSession(tenantA, appB, sessionIds.appB, ids.restrictedB, "app-b");
      await insertSession(tenantB, appA, sessionIds.tenantB, ids.tenantBRestricted, "tenant-b");

      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE eper_customer_asset_access");

      // Application A sees only its own restricted asset. An unlinked shared
      // asset and assets owned/linked to application B remain invisible.
      await setContext(tenantA, appA);
      let result = await client.query(
        "SELECT asset_id FROM eper_customer_assets WHERE tenant_id = $1 ORDER BY asset_id",
        [tenantA],
      );
      assert.deepEqual(result.rows.map(row => row.asset_id), [ids.restrictedA]);

      result = await client.query(
        "SELECT asset_id FROM eper_customer_assets WHERE tenant_id = $1",
        [tenantB],
      );
      assert.equal(result.rowCount, 0, "tenant A context must not read tenant B assets");
      result = await client.query(
        "SELECT application_id, asset_id FROM eper_customer_asset_application_links WHERE tenant_id = $1",
        [tenantB],
      );
      assert.equal(result.rowCount, 0, "tenant A context must not read tenant B links");
      result = await client.query(
        "SELECT upload_session_id FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1",
        [tenantB],
      );
      assert.equal(result.rowCount, 0, "tenant A context must not read tenant B upload sessions");

      result = await client.query(
        "SELECT application_id, asset_id FROM eper_customer_asset_application_links WHERE tenant_id = $1",
        [tenantA],
      );
      assert.equal(result.rowCount, 0, "application A must not read application B's link");

      result = await client.query(
        "SELECT upload_session_id FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1",
        [tenantA],
      );
      assert.deepEqual(result.rows.map(row => row.upload_session_id), [sessionIds.appA]);

      // Application B sees the explicitly linked shared asset and its own
      // restricted asset, but not A's restricted asset or an unlinked asset.
      await setContext(tenantA, appB);
      result = await client.query(
        "SELECT asset_id FROM eper_customer_assets WHERE tenant_id = $1 ORDER BY asset_id",
        [tenantA],
      );
      assert.deepEqual(
        result.rows.map(row => row.asset_id).sort(),
        [ids.sharedLinkedB, ids.restrictedB].sort(),
      );
      result = await client.query(
        "SELECT application_id, asset_id FROM eper_customer_asset_application_links WHERE tenant_id = $1",
        [tenantA],
      );
      assert.deepEqual(result.rows, [{ application_id: appB, asset_id: ids.sharedLinkedB }]);
      result = await client.query(
        "SELECT upload_session_id FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1",
        [tenantA],
      );
      assert.deepEqual(result.rows.map(row => row.upload_session_id), [sessionIds.appB]);

      // Switching back to application A, cross-application updates affect zero
      // rows, while cross-tenant and mismatched-application inserts are rejected.
      await setContext(tenantA, appA);
      result = await client.query(
        "UPDATE eper_customer_assets SET display_name = 'tampered' WHERE tenant_id = $1 AND asset_id = $2",
        [tenantA, ids.restrictedB],
      );
      assert.equal(result.rowCount, 0, "application A must not update application B's asset");
      result = await client.query(
        "UPDATE eper_customer_assets SET display_name = 'tampered' WHERE tenant_id = $1 AND asset_id = $2",
        [tenantB, ids.tenantBRestricted],
      );
      assert.equal(result.rowCount, 0, "tenant A must not update tenant B assets");
      result = await client.query(
        "UPDATE eper_customer_asset_upload_sessions SET upload_status = 'aborted' WHERE tenant_id = $1 AND upload_session_id = $2",
        [tenantB, sessionIds.tenantB],
      );
      assert.equal(result.rowCount, 0, "tenant A must not update tenant B upload sessions");
      result = await client.query(
        "UPDATE eper_customer_asset_upload_sessions SET upload_status = 'aborted' WHERE tenant_id = $1 AND upload_session_id = $2",
        [tenantA, sessionIds.appB],
      );
      assert.equal(result.rowCount, 0, "application A must not update application B's upload session");
      await expectRlsDenied(
        `INSERT INTO eper_customer_assets (
          tenant_id, asset_id, repository_scope, display_name, original_file_name,
          media_category, mime_type, file_extension, size_bytes, storage_adapter_key,
          storage_object_reference, created_by, updated_by
        ) VALUES ($1,$2,'customer_shared','Denied','denied.txt','document','text/plain',
                  'txt',16,'test-adapter','opaque:denied','rls-test','rls-test')`,
        [tenantB, randomUUID()],
      );
      await expectRlsDenied(
        `INSERT INTO eper_customer_asset_application_links (
          tenant_id, application_id, asset_id, linked_by, link_reason, idempotency_key
        ) VALUES ($1,$2,$3,'rls-test','denied-cross-app',$4)`,
        [tenantA, appB, ids.sharedUnlinked, "rls-denied-" + randomUUID()],
      );
      await expectRlsDenied(
        `INSERT INTO eper_customer_asset_upload_sessions (
          tenant_id, application_id, upload_session_id, asset_id, actor_id,
          expected_size_bytes, idempotency_key, expires_at
        ) VALUES ($1,$2,$3,$4,'rls-test',16,$5,now() + interval '1 hour')`,
        [tenantA, appB, randomUUID(), ids.sharedUnlinked, "rls-denied-" + randomUUID()],
      );
      await client.query("ROLLBACK");
    } finally {
      // Roll back role/context first, then remove fixtures as the CI database owner.
      await client.query("ROLLBACK").catch(() => undefined);
      await pool.query("DELETE FROM eper_customer_asset_upload_sessions WHERE tenant_id = ANY($1::text[])", [[tenantA, tenantB]]).catch(() => undefined);
      await pool.query("DELETE FROM eper_customer_asset_application_links WHERE tenant_id = ANY($1::text[])", [[tenantA, tenantB]]).catch(() => undefined);
      await pool.query("DELETE FROM eper_customer_assets WHERE tenant_id = ANY($1::text[])", [[tenantA, tenantB]]).catch(() => undefined);
      client.release();
      await pool.end();
    }
  });
