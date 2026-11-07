import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { assertRestrictedWorkerDatabaseRole } from "../dist/packages/workflows/workflow-outbox-worker-database.js";

const databaseUrl = process.env.EPER_WORKFLOW_OUTBOX_TEST_DATABASE_URL;
const expectedRole = process.env.EPER_WORKFLOW_OUTBOX_EXPECTED_DATABASE_ROLE || "eper_workflow_outbox_worker_runtime";

test("dedicated workflow outbox login satisfies the live restricted PostgreSQL role gate", {
  skip: !databaseUrl,
}, async () => {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5000,
    application_name: "eper-workflow-outbox-role-contract-test",
  });
  try {
    await assertRestrictedWorkerDatabaseRole(pool, expectedRole);
  } finally {
    await pool.end();
  }
});


test("worker startup gate rejects unauthorized column-level write grants", {
  skip: !databaseUrl || !process.env.DATABASE_URL,
}, async () => {
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const worker = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await admin.query(
      "GRANT UPDATE (tenant_id) ON public.eper_workflow_outbox_delivery TO " + expectedRole,
    );
    await assert.rejects(
      () => assertRestrictedWorkerDatabaseRole(worker, expectedRole),
      /WORKFLOW_OUTBOX_DATABASE_GRANTS_INVALID/,
    );
    await admin.query(
      "REVOKE UPDATE (tenant_id) ON public.eper_workflow_outbox_delivery FROM " + expectedRole,
    );

    await admin.query(
      "GRANT UPDATE (tenant_id) ON public.eper_tenant_application_assignment TO " + expectedRole,
    );
    await assert.rejects(
      () => assertRestrictedWorkerDatabaseRole(worker, expectedRole),
      /WORKFLOW_OUTBOX_DATABASE_GRANTS_INVALID/,
    );
  } finally {
    await admin.query(
      "REVOKE UPDATE (tenant_id) ON public.eper_workflow_outbox_delivery FROM " + expectedRole,
    ).catch(() => undefined);
    await admin.query(
      "REVOKE UPDATE (tenant_id) ON public.eper_tenant_application_assignment FROM " + expectedRole,
    ).catch(() => undefined);
    await worker.end();
    await admin.end();
  }
});
