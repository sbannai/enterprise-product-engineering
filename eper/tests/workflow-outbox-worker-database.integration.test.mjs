import test from "node:test";
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
