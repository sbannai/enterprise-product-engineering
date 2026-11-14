import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const adminUrl = process.env.DATABASE_URL;
const workerUrl = process.env.EPER_APPLICATION_DATA_EXECUTOR_TEST_DATABASE_URL;
test("restricted executor login has only scoped application-data access", { skip: !adminUrl || !workerUrl }, async () => {
  const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
  const worker = new pg.Pool({ connectionString: workerUrl, max: 1 });
  const suffix = randomUUID().replaceAll("-", "");
  const tenantA = "ci-executor-a-" + suffix.slice(0, 12);
  const tenantB = "ci-executor-b-" + suffix.slice(0, 12);
  const appA = "ci-app-a-" + suffix.slice(0, 12);
  const appB = "ci-app-b-" + suffix.slice(0, 12);
  const entity = "Order";
  const recordA = "ci-order-a-" + suffix.slice(0, 12);
  const recordB = "ci-order-b-" + suffix.slice(0, 12);
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('eper.tenant_id',$1,true)", [tenantA]);
    await client.query("SELECT set_config('eper.application_id',$1,true)", [appA]);
    await client.query(
      "INSERT INTO eper_application_data_models(tenant_id,application_id,entity_type,version,status,fields,relationships) VALUES($1,$2,$3,1,'ACTIVE',$4::jsonb,'[]'::jsonb)",
      [tenantA, appA, entity, JSON.stringify([{ id: "label", type: "string", required: true }])],
    );
    await client.query(
      "INSERT INTO eper_application_data_records(tenant_id,application_id,entity_type,record_id,schema_version,version,state,data) VALUES($1,$2,$3,$4,1,1,'ACTIVE',$5::jsonb)",
      [tenantA, appA, entity, recordA, JSON.stringify({ label: "visible" })],
    );
    await client.query("SELECT set_config('eper.tenant_id',$1,true)", [tenantB]);
    await client.query("SELECT set_config('eper.application_id',$1,true)", [appB]);
    await client.query(
      "INSERT INTO eper_application_data_models(tenant_id,application_id,entity_type,version,status,fields,relationships) VALUES($1,$2,$3,1,'ACTIVE',$4::jsonb,'[]'::jsonb)",
      [tenantB, appB, entity, JSON.stringify([{ id: "label", type: "string", required: true }])],
    );
    await client.query(
      "INSERT INTO eper_application_data_records(tenant_id,application_id,entity_type,record_id,schema_version,version,state,data) VALUES($1,$2,$3,$4,1,1,'ACTIVE',$5::jsonb)",
      [tenantB, appB, entity, recordB, JSON.stringify({ label: "hidden" })],
    );
    await client.query("COMMIT");

    const scoped = await worker.connect();
    try {
      await scoped.query("BEGIN");
      const identity = await scoped.query(`
        SELECT current_user AS role_name, r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole,
               pg_has_role(current_user,'eper_application_data_executor_access','USAGE') AS member,
               has_table_privilege(current_user,'public.eper_application_data_records','INSERT') AS can_insert_record,
               has_table_privilege(current_user,'public.eper_application_data_records','UPDATE') AS can_update_record,
               has_table_privilege(current_user,'public.eper_application_data_records','DELETE') AS can_delete_record,
               has_table_privilege(current_user,'public.eper_application_data_idempotency','INSERT') AS can_write_idempotency,
               has_table_privilege(current_user,'public.audit_evidence','INSERT') AS can_append_audit,
               has_table_privilege(current_user,'public.transactional_outbox','INSERT') AS can_append_outbox,
               has_table_privilege(current_user,'public.eper_workflow_instances','UPDATE') AS can_update_workflow
          FROM pg_roles r WHERE r.rolname=current_user
      `);
      const role = identity.rows[0];
      assert.equal(role.rolsuper, false);
      assert.equal(role.rolbypassrls, false);
      assert.equal(role.rolcreatedb, false);
      assert.equal(role.rolcreaterole, false);
      assert.equal(role.member, true);
      assert.equal(role.can_insert_record, true);
      assert.equal(role.can_update_record, true);
      assert.equal(role.can_delete_record, true);
      assert.equal(role.can_write_idempotency, true);
      assert.equal(role.can_append_audit, true);
      assert.equal(role.can_append_outbox, true);
      assert.equal(role.can_update_workflow, false);

      await scoped.query("SELECT set_config('eper.tenant_id',$1,true)", [tenantA]);
      await scoped.query("SELECT set_config('eper.application_id',$1,true)", [appA]);
      const visible = await scoped.query(
        "SELECT record_id FROM eper_application_data_records WHERE record_id IN ($1,$2) ORDER BY record_id",
        [recordA, recordB],
      );
      assert.deepEqual(visible.rows.map(row => row.record_id), [recordA]);
      const inserted = "ci-order-write-" + suffix.slice(0, 12);
      await scoped.query(
        "INSERT INTO eper_application_data_records(tenant_id,application_id,entity_type,record_id,schema_version,version,state,data) VALUES($1,$2,$3,$4,1,1,'ACTIVE',$5::jsonb)",
        [tenantA, appA, entity, inserted, JSON.stringify({ label: "created" })],
      );
      await scoped.query(
        "UPDATE eper_application_data_records SET data=$5::jsonb,version=version+1 WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND record_id=$4",
        [tenantA, appA, entity, inserted, JSON.stringify({ label: "updated" })],
      );
      const updated = await scoped.query(
        "SELECT data->>'label' AS label FROM eper_application_data_records WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND record_id=$4",
        [tenantA, appA, entity, inserted],
      );
      assert.equal(updated.rows[0]?.label, "updated");
      await scoped.query(
        "DELETE FROM eper_application_data_records WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND record_id=$4",
        [tenantA, appA, entity, inserted],
      );
      await scoped.query("ROLLBACK");
    } finally {
      scoped.release();
    }
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* preserve test failure */ }
    throw error;
  } finally {
    client.release();
    await worker.end();
    await admin.end();
  }
});
